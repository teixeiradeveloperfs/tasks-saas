import { ConfiguredRateLimitStore } from "@/security/redis-rate-limit";

const store = new ConfiguredRateLimitStore();

export async function consumeTwoFactorAttempt(userId: string, clientIp?: string | null) {
  const windowMs = 10 * 60 * 1000;
  const checks = [store.consume(`2fa:user:${userId}`, 8, windowMs, Date.now())];
  if (clientIp) checks.push(store.consume(`2fa:ip:${clientIp}`, 30, windowMs, Date.now()));
  const results = await Promise.all(checks);
  return results.every((result) => result.allowed);
}
