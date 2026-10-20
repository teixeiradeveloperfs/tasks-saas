import { describe, expect, it } from "vitest";

import {
  FreshTwoFactorRequiredError,
  requireRecentTwoFactor,
  SENSITIVE_ACTION_2FA_MAX_AGE_MS,
} from "@/auth/require-session";
import type { FastifyRequest } from "fastify";

describe("2FA recente para ações sensíveis", () => {
  it("aceita uma confirmação recente", () => {
    const request = {
      twoFactorEnabled: true,
      twoFactorVerifiedAt: new Date(Date.now() - SENSITIVE_ACTION_2FA_MAX_AGE_MS + 1_000),
    } as FastifyRequest;
    expect(() => requireRecentTwoFactor(request)).not.toThrow();
  });

  it("recusa confirmação antiga ou ausente", () => {
    const old = {
      twoFactorEnabled: true,
      twoFactorVerifiedAt: new Date(Date.now() - SENSITIVE_ACTION_2FA_MAX_AGE_MS - 1_000),
    } as FastifyRequest;
    expect(() => requireRecentTwoFactor(old)).toThrow(FreshTwoFactorRequiredError);
    expect(() => requireRecentTwoFactor({ twoFactorEnabled: true } as FastifyRequest)).toThrow(
      FreshTwoFactorRequiredError,
    );
  });

  it("não exige confirmação quando o usuário não ativou o 2FA", () => {
    expect(() =>
      requireRecentTwoFactor({ twoFactorEnabled: false } as FastifyRequest),
    ).not.toThrow();
  });
});
