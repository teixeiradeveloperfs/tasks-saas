import type { FastifyInstance } from "fastify";

import { resolveClientIp } from "@/security/client-ip";
import { ConfiguredRateLimitStore } from "@/security/redis-rate-limit";

const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 300;

export function registerRateLimit(
  app: FastifyInstance,
  trustedProxyHeader: string | undefined,
): void {
  // Redis is required by env validation in production, so every instance consumes
  // the same atomic sliding window. Development transparently falls back to memory.
  const store = new ConfiguredRateLimitStore();

  app.addHook("onRequest", async (request, reply) => {
    const headers = new Headers();
    if (trustedProxyHeader) {
      const raw = request.headers[trustedProxyHeader.toLowerCase()];
      const value = Array.isArray(raw) ? raw.join(",") : raw;
      if (value) headers.set(trustedProxyHeader, value);
    }
    const ip = resolveClientIp(headers, trustedProxyHeader) ?? request.ip;
    const key = `request:${ip}`;
    const result = await store.consume(key, REQUESTS_PER_WINDOW, WINDOW_MS);

    reply.header("RateLimit-Limit", String(REQUESTS_PER_WINDOW));
    reply.header("RateLimit-Remaining", String(result.remaining));

    if (!result.allowed) {
      return reply
        .code(429)
        .header("retry-after", String(Math.ceil(result.retryAfterMs / 1000)))
        .send({ error: "Muitas requisições. Tente novamente em instantes." });
    }
  });
}
