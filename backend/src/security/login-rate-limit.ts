import { ConfiguredRateLimitStore } from "@/security/redis-rate-limit";
import { MemoryRateLimitStore, type RateLimitStore } from "@/security/rate-limit";

export const LOGIN_RATE_LIMIT_POLICY = {
  email: { limit: 10, windowMs: 15 * 60 * 1000 },
  ip: { limit: 50, windowMs: 15 * 60 * 1000 },
} as const;

export type LoginRateLimitInput = {
  email: string;
  clientIp?: string | null;
};

export type LoginRateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
};

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class LoginRateLimiter {
  constructor(
    private readonly store: RateLimitStore = new MemoryRateLimitStore(),
    private readonly namespace = "login",
  ) {}

  async consume(
    input: LoginRateLimitInput,
    now: number = Date.now(),
  ): Promise<LoginRateLimitResult> {
    const checks = [
      this.store.consume(
        `${this.namespace}:email:${normalizeLoginEmail(input.email)}`,
        LOGIN_RATE_LIMIT_POLICY.email.limit,
        LOGIN_RATE_LIMIT_POLICY.email.windowMs,
        now,
      ),
    ];

    if (input.clientIp) {
      checks.push(
        this.store.consume(
          `${this.namespace}:ip:${input.clientIp}`,
          LOGIN_RATE_LIMIT_POLICY.ip.limit,
          LOGIN_RATE_LIMIT_POLICY.ip.windowMs,
          now,
        ),
      );
    }

    const results = await Promise.all(checks);
    const rejected = results.filter((result) => !result.allowed);

    return {
      allowed: rejected.length === 0,
      retryAfterMs: rejected.reduce((longest, result) => Math.max(longest, result.retryAfterMs), 0),
    };
  }
}

export const loginRateLimiter = new LoginRateLimiter(new ConfiguredRateLimitStore());
export const signUpRateLimiter = new LoginRateLimiter(new ConfiguredRateLimitStore(), "signup");
export const inviteAcceptRateLimiter = new LoginRateLimiter(
  new ConfiguredRateLimitStore(),
  "invite-accept",
);
