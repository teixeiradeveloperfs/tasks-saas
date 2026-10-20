import { describe, expect, it } from "vitest";

import {
  LOGIN_RATE_LIMIT_POLICY,
  LoginRateLimiter,
  normalizeLoginEmail,
} from "@/security/login-rate-limit";
import { MemoryRateLimitStore } from "@/security/rate-limit";

describe("LoginRateLimiter", () => {
  it("normaliza o e-mail antes de criar a chave", async () => {
    const limiter = new LoginRateLimiter(new MemoryRateLimitStore());
    const now = 1_000_000;

    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT_POLICY.email.limit; attempt++) {
      expect(
        (
          await limiter.consume(
            { email: attempt % 2 ? " User@Example.COM " : "user@example.com" },
            now,
          )
        ).allowed,
      ).toBe(true);
    }

    expect((await limiter.consume({ email: "USER@example.com" }, now)).allowed).toBe(false);
  });

  it("mantém e-mails diferentes isolados", async () => {
    const limiter = new LoginRateLimiter(new MemoryRateLimitStore());
    const now = 1_000_000;

    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT_POLICY.email.limit; attempt++) {
      await limiter.consume({ email: "first@example.com" }, now);
    }

    expect((await limiter.consume({ email: "first@example.com" }, now)).allowed).toBe(false);
    expect((await limiter.consume({ email: "second@example.com" }, now)).allowed).toBe(true);
  });

  it("limita tentativas distribuídas entre e-mails pelo IP confiável", async () => {
    const limiter = new LoginRateLimiter(new MemoryRateLimitStore());
    const now = 1_000_000;

    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT_POLICY.ip.limit; attempt++) {
      expect(
        (
          await limiter.consume(
            { email: `user-${attempt}@example.com`, clientIp: "203.0.113.7" },
            now,
          )
        ).allowed,
      ).toBe(true);
    }

    expect(
      (await limiter.consume({ email: "another@example.com", clientIp: "203.0.113.7" }, now))
        .allowed,
    ).toBe(false);
  });

  it("não cria limite por IP quando a origem não é confiável", async () => {
    const limiter = new LoginRateLimiter(new MemoryRateLimitStore());
    const now = 1_000_000;

    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT_POLICY.ip.limit + 1; attempt++) {
      expect(
        (await limiter.consume({ email: `user-${attempt}@example.com`, clientIp: null }, now))
          .allowed,
      ).toBe(true);
    }
  });

  it("libera novas tentativas depois da janela", async () => {
    const limiter = new LoginRateLimiter(new MemoryRateLimitStore());
    const now = 1_000_000;

    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT_POLICY.email.limit; attempt++) {
      await limiter.consume({ email: "user@example.com" }, now);
    }

    const blocked = await limiter.consume({ email: "user@example.com" }, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(LOGIN_RATE_LIMIT_POLICY.email.windowMs);

    expect(
      (
        await limiter.consume(
          { email: "user@example.com" },
          now + LOGIN_RATE_LIMIT_POLICY.email.windowMs + 1,
        )
      ).allowed,
    ).toBe(true);
  });
});

describe("normalizeLoginEmail", () => {
  it("remove espaços externos e normaliza caixa", () => {
    expect(normalizeLoginEmail("  User@Example.COM ")).toBe("user@example.com");
  });
});
