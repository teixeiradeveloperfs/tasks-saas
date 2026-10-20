import { describe, expect, it } from "vitest";

import { AiRateLimitError, AiRateLimiter } from "@/security/ai-rate-limit";
import { MemoryRateLimitStore } from "@/security/rate-limit";

describe("AiRateLimiter", () => {
  it("permite 30 gerações por usuário na janela e bloqueia a seguinte", async () => {
    const limiter = new AiRateLimiter(new MemoryRateLimitStore());
    for (let request = 0; request < 30; request++) {
      await expect(limiter.consume("user-1", 1_000)).resolves.toBeUndefined();
    }
    await expect(limiter.consume("user-1", 1_000)).rejects.toBeInstanceOf(AiRateLimitError);
  });

  it("isola o limite entre usuários", async () => {
    const limiter = new AiRateLimiter(new MemoryRateLimitStore());
    for (let request = 0; request < 30; request++) await limiter.consume("user-1", 1_000);
    await expect(limiter.consume("user-2", 1_000)).resolves.toBeUndefined();
  });
});
