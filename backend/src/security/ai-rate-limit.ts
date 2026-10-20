import type { RateLimitStore } from "@/security/rate-limit";
import { ConfiguredRateLimitStore } from "@/security/redis-rate-limit";

const AI_REQUEST_LIMIT = 30;
const AI_WINDOW_MS = 60 * 60 * 1_000;

export class AiRateLimitError extends Error {
  statusCode = 429;
  statusMessage = "Limite de sugestões por IA atingido. Tente novamente mais tarde.";

  constructor(readonly retryAfterMs: number) {
    super();
  }
}

export class AiRateLimiter {
  constructor(private readonly store: RateLimitStore = new ConfiguredRateLimitStore()) {}

  async consume(userId: string, now?: number): Promise<void> {
    const result = await this.store.consume(
      `ai:user:${userId}`,
      AI_REQUEST_LIMIT,
      AI_WINDOW_MS,
      now,
    );
    if (!result.allowed) throw new AiRateLimitError(result.retryAfterMs);
  }
}

export const aiRateLimiter = new AiRateLimiter();
