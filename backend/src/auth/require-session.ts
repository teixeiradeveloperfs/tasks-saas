import type { FastifyReply, FastifyRequest } from "fastify";

import { readSessionCookie } from "@/auth/cookie";
import { readSession } from "@/auth/session";
import { UnauthorizedError } from "@/workspace/current-user";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

/**
 * `preHandler` das rotas autenticadas: valida a sessão uma vez e anota o usuário
 * na requisição, de onde `currentUserId` o lê.
 */
export async function requireSession(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  await requirePrimarySession(request, _reply);
}

export class TwoFactorRequiredError extends Error {
  statusCode = 403;
  statusMessage = "Confirme a autenticação em duas etapas para continuar.";
  code = "two_factor_required";
}

export const SENSITIVE_ACTION_2FA_MAX_AGE_MS = 5 * 60 * 1000;

export class FreshTwoFactorRequiredError extends Error {
  statusCode = 403;
  statusMessage = "Confirme novamente o 2FA para acessar este segredo.";
  code = "fresh_two_factor_required";
}

export function requireRecentTwoFactor(request: FastifyRequest): void {
  // O 2FA é opcional. Só exigimos uma confirmação recente para contas que
  // escolheram ativá-lo; contas sem 2FA continuam podendo usar o vault.
  if (!request.twoFactorEnabled) return;
  const verifiedAt = request.twoFactorVerifiedAt;
  if (!verifiedAt || Date.now() - verifiedAt.getTime() > SENSITIVE_ACTION_2FA_MAX_AGE_MS) {
    throw new FreshTwoFactorRequiredError();
  }
}

declare module "fastify" {
  interface FastifyRequest {
    sessionId?: string;
    twoFactorEnabled?: boolean;
    twoFactorVerified?: boolean;
    twoFactorVerifiedAt?: Date;
  }
}

export async function requirePrimarySession(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const token = readSessionCookie(request);
  const session = token ? await readSession(token) : null;
  if (!session) throw new UnauthorizedError();
  request.userId = session.user.id;
  request.sessionId = session.session.id;
  request.twoFactorEnabled = Boolean(session.user.twoFactorEnabledAt);
  request.twoFactorVerified = Boolean(session.session.twoFactorVerifiedAt);
  request.twoFactorVerifiedAt = session.session.twoFactorVerifiedAt ?? undefined;
}
