import { describe, expect, it, vi } from "vitest";

import { RedisRateLimitStore, type RedisScriptClient } from "@/security/redis-rate-limit";

function redisReturning(result: [number, number, number]) {
  const evalCall = vi.fn(async (_script: string, _keys: string[], _args: unknown[]) => result);
  const client: RedisScriptClient = {
    eval: async <TData = unknown>(script: string, keys: string[], args: string[]) =>
      evalCall(script, keys, args) as Promise<TData>,
  };

  return { client, evalCall };
}

describe("RedisRateLimitStore", () => {
  it("converte a resposta atômica do script", async () => {
    const { client } = redisReturning([1, 7, 0]);
    const store = new RedisRateLimitStore(client);

    await expect(
      store.consume("login:email:user@example.com", 10, 60_000, 123_000),
    ).resolves.toEqual({
      allowed: true,
      remaining: 7,
      retryAfterMs: 0,
    });
  });

  it("não envia e-mail nem IP em texto puro como chave Redis", async () => {
    const { client, evalCall } = redisReturning([0, 0, 45_000]);
    const store = new RedisRateLimitStore(client);

    const result = await store.consume("login:email:user@example.com", 10, 60_000, 123_000);
    const [, keys] = evalCall.mock.calls[0]!;

    expect(result).toEqual({ allowed: false, remaining: 0, retryAfterMs: 45_000 });
    expect(keys[0]).toMatch(/^workspace-hub:rate-limit:v1:[a-f0-9]{64}$/);
    expect(keys[0]).not.toContain("user@example.com");
  });

  it("recusa uma resposta inesperada do Redis", async () => {
    const { client } = redisReturning([1, 2, 3]);
    client.eval = async () => [1, 2] as never;
    const store = new RedisRateLimitStore(client);

    await expect(store.consume("key", 10, 60_000)).rejects.toThrow(/Resposta inválida/);
  });
});
