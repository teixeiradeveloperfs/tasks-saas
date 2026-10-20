import { describe, expect, it } from "vitest";
import { MemoryRateLimitStore } from "@/security/rate-limit";

describe("MemoryRateLimitStore", () => {
  it("permite até o limite e recusa a próxima", async () => {
    const store = new MemoryRateLimitStore();
    const now = 1_000_000;
    expect((await store.consume("ip:1", 3, 60_000, now)).allowed).toBe(true);
    expect((await store.consume("ip:1", 3, 60_000, now)).allowed).toBe(true);
    expect((await store.consume("ip:1", 3, 60_000, now)).allowed).toBe(true);
    expect((await store.consume("ip:1", 3, 60_000, now)).allowed).toBe(false);
  });

  it("informa quantas requisições restam", async () => {
    const store = new MemoryRateLimitStore();
    const now = 1_000_000;
    expect((await store.consume("ip:1", 3, 60_000, now)).remaining).toBe(2);
    expect((await store.consume("ip:1", 3, 60_000, now)).remaining).toBe(1);
  });

  it("conta chaves diferentes de forma independente", async () => {
    const store = new MemoryRateLimitStore();
    const now = 1_000_000;
    await store.consume("ip:1", 1, 60_000, now);
    expect((await store.consume("ip:1", 1, 60_000, now)).allowed).toBe(false);
    expect((await store.consume("ip:2", 1, 60_000, now)).allowed).toBe(true);
  });

  it("devolve o crédito quando a janela passa", async () => {
    const store = new MemoryRateLimitStore();
    const now = 1_000_000;
    await store.consume("ip:1", 1, 60_000, now);
    expect((await store.consume("ip:1", 1, 60_000, now)).allowed).toBe(false);
    expect((await store.consume("ip:1", 1, 60_000, now + 60_001)).allowed).toBe(true);
  });

  it("diz em quanto tempo tentar de novo", async () => {
    const store = new MemoryRateLimitStore();
    const now = 1_000_000;
    await store.consume("ip:1", 1, 60_000, now);
    const rejected = await store.consume("ip:1", 1, 60_000, now + 10_000);
    expect(rejected.retryAfterMs).toBe(50_000);
  });

  it("descarta chaves vencidas em vez de acumular memória", async () => {
    const store = new MemoryRateLimitStore();
    const now = 1_000_000;
    for (let i = 0; i < 500; i++) await store.consume(`ip:${i}`, 5, 60_000, now);
    expect(store.size).toBe(500);
    store.prune(60_000, now + 60_001);
    expect(store.size).toBe(0);
  });

  it("preserva chaves ainda dentro da janela ao limpar", async () => {
    const store = new MemoryRateLimitStore();
    const now = 1_000_000;
    await store.consume("antiga", 5, 60_000, now);
    await store.consume("recente", 5, 60_000, now + 59_000);
    store.prune(60_000, now + 60_001);
    expect(store.size).toBe(1);
    expect((await store.consume("recente", 5, 60_000, now + 60_001)).remaining).toBe(3);
  });
});
