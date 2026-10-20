import { createHash, randomUUID } from "node:crypto";

import { Redis } from "@upstash/redis";
import { createClient } from "redis";

import { getEnv, type Env } from "@/config/env";
import {
  MemoryRateLimitStore,
  type RateLimitResult,
  type RateLimitStore,
} from "@/security/rate-limit";

export type RedisScriptClient = {
  eval<TData = unknown>(script: string, keys: string[], args: string[]): Promise<TData>;
};

class LocalRedisScriptClient implements RedisScriptClient {
  private readonly client;
  private connection: Promise<void> | undefined;

  constructor(url: string) {
    this.client = createClient({ url });
    // O comando que estiver em execução ainda rejeita sua própria Promise. O
    // listener impede que o EventEmitter transforme uma oscilação em crash.
    this.client.on("error", () => undefined);
  }

  async eval<TData>(script: string, keys: string[], args: string[]): Promise<TData> {
    if (!this.client.isOpen) {
      this.connection ??= this.client
        .connect()
        .then(() => undefined)
        .catch((error) => {
          this.connection = undefined;
          throw error;
        });
      await this.connection;
    }

    return (await this.client.eval(script, { keys, arguments: args })) as TData;
  }
}

class UpstashRedisScriptClient implements RedisScriptClient {
  constructor(private readonly client: Redis) {}

  eval<TData>(script: string, keys: string[], args: string[]): Promise<TData> {
    return this.client.eval<string[], TData>(script, keys, args);
  }
}

const consumeScript = `
local key = KEYS[1]
local serverTime = redis.call("TIME")
local now = tonumber(serverTime[1]) * 1000 + math.floor(tonumber(serverTime[2]) / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local member = ARGV[3]
local cutoff = now - window

redis.call("ZREMRANGEBYSCORE", key, "-inf", cutoff)
local count = redis.call("ZCARD", key)

if count >= limit then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  local retryAfter = window
  if oldest[2] then
    retryAfter = math.max(0, tonumber(oldest[2]) + window - now)
  end
  redis.call("PEXPIRE", key, window)
  return {0, 0, retryAfter}
end

redis.call("ZADD", key, now, member)
redis.call("PEXPIRE", key, window)
return {1, limit - count - 1, 0}
`;

function namespacedKey(key: string): string {
  const digest = createHash("sha256").update(key).digest("hex");
  return `workspace-hub:rate-limit:v1:${digest}`;
}

/** Sliding-window rate limit shared atomically by every application instance. */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: RedisScriptClient) {}

  async consume(
    key: string,
    limit: number,
    windowMs: number,
    _now: number = Date.now(),
  ): Promise<RateLimitResult> {
    const result = await this.redis.eval<[number, number, number]>(
      consumeScript,
      [namespacedKey(key)],
      [String(windowMs), String(limit), randomUUID()],
    );

    if (!Array.isArray(result) || result.length !== 3) {
      throw new Error("Resposta inválida do Redis ao aplicar rate limit.");
    }

    return {
      allowed: Number(result[0]) === 1,
      remaining: Number(result[1]),
      retryAfterMs: Number(result[2]),
    };
  }
}

function redisCredentials(env: Env): { url: string; token: string } | null {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN };
  }

  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
    return { url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN };
  }

  return null;
}

export function createRateLimitStore(env: Env = getEnv()): RateLimitStore {
  if (env.REDIS_URL) return new RedisRateLimitStore(new LocalRedisScriptClient(env.REDIS_URL));

  const credentials = redisCredentials(env);
  if (credentials) {
    return new RedisRateLimitStore(new UpstashRedisScriptClient(new Redis(credentials)));
  }

  return new MemoryRateLimitStore();
}

/** Defers env access until the first login request, keeping imports side-effect free. */
export class ConfiguredRateLimitStore implements RateLimitStore {
  private store: RateLimitStore | undefined;

  consume(key: string, limit: number, windowMs: number, now?: number): Promise<RateLimitResult> {
    this.store ??= createRateLimitStore();
    return this.store.consume(key, limit, windowMs, now);
  }
}
