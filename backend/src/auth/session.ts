import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/db/client";

// A sessão é deslizante, mas expira após sete dias sem uso e nunca ultrapassa 30 dias.
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

type SessionMeta = { userAgent?: string; ipAddress?: string };

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function expiresAt(createdAt: Date = new Date()): Date {
  return new Date(
    Math.min(Date.now() + SESSION_TTL_MS, createdAt.getTime() + SESSION_MAX_LIFETIME_MS),
  );
}

export async function createSession(userId: string, meta: SessionMeta = {}) {
  const token = newToken();
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: tokenHash(token),
      expiresAt: expiresAt(),
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    },
  });
  return { token, session };
}

export async function readSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  const now = new Date();
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.createdAt.getTime() + SESSION_MAX_LIFETIME_MS <= now.getTime()
  ) {
    return null;
  }

  const halfway = session.createdAt.getTime() + SESSION_TTL_MS / 2;

  // Renovação deslizante sem trocar o token. Emitir token novo aqui revogaria o que o
  // navegador tem em mãos — e como nenhum chamador reescreve o cookie, a sessão morria.
  // Mesmo reescrevendo, as requisições paralelas já em voo com o token antigo levariam
  // 401. A rotação continua no login, que é onde ela defende contra fixação de sessão.
  const updated = await prisma.session.update({
    where: { id: session.id },
    data:
      now.getTime() >= halfway
        ? { lastUsedAt: now, expiresAt: expiresAt(session.createdAt) }
        : { lastUsedAt: now },
  });
  return { token, session: updated, user: session.user };
}

export async function renewSession(token: string, meta?: SessionMeta) {
  const current = await readSessionWithoutRenewal(token);
  if (!current) return null;
  return rotateSession(
    token,
    meta ?? {
      userAgent: current.userAgent ?? undefined,
      ipAddress: current.ipAddress ?? undefined,
    },
  );
}

export async function rotateSession(token: string, meta: SessionMeta = {}) {
  const current = await readSessionWithoutRenewal(token);
  if (
    !current ||
    current.revokedAt ||
    current.expiresAt <= new Date() ||
    current.createdAt.getTime() + SESSION_MAX_LIFETIME_MS <= Date.now()
  ) {
    return null;
  }
  return prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: current.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    const replacementToken = newToken();
    const replacement = await tx.session.create({
      data: {
        userId: current.userId,
        tokenHash: tokenHash(replacementToken),
        expiresAt: expiresAt(),
        userAgent: meta.userAgent ?? current.userAgent,
        ipAddress: meta.ipAddress ?? current.ipAddress,
      },
    });
    return { token: replacementToken, session: replacement };
  });
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: tokenHash(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { createdAt: { lt: new Date(Date.now() - SESSION_MAX_LIFETIME_MS) } },
      ],
    },
  });
  return result.count;
}

async function readSessionWithoutRenewal(token: string) {
  return prisma.session.findUnique({ where: { tokenHash: tokenHash(token) } });
}
