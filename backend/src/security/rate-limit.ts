export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number, now?: number): Promise<RateLimitResult>;
}

/** In-memory sliding-window store; replaceable with a shared store when scaling out. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>();

  async consume(
    key: string,
    limit: number,
    windowMs: number,
    now: number = Date.now(),
  ): Promise<RateLimitResult> {
    const cutoff = now - windowMs;
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: recent[0] + windowMs - now,
      };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true, remaining: limit - recent.length, retryAfterMs: 0 };
  }

  prune(windowMs: number, now: number = Date.now()): void {
    const cutoff = now - windowMs;

    for (const [key, timestamps] of this.hits) {
      const recent = timestamps.filter((timestamp) => timestamp > cutoff);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }

  get size(): number {
    return this.hits.size;
  }
}
