import type { CurrentUser } from "@task-flow/shared/domain/auth-contracts";

import { readSession } from "@/auth/session";

/**
 * Núcleo testável de `me`. Recebe o token em vez de ler o cookie para poder ser
 * exercitado fora do contexto de uma requisição.
 */
export async function readCurrentUser(token: string | undefined): Promise<CurrentUser> {
  if (!token) return { authenticated: false };
  const session = await readSession(token);
  if (!session) return { authenticated: false };
  return {
    authenticated: true,
    userId: session.user.id,
    twoFactor: session.session.twoFactorVerifiedAt
      ? "verified"
      : session.user.twoFactorEnabledAt
        ? "challenge_required"
        : "setup_required",
  };
}
