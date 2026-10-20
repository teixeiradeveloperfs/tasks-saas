import type { FastifyInstance, FastifyRequest } from "fastify";
import { twoFactorCodeInput } from "@task-flow/shared/domain/security-contracts";

import { requirePrimarySession, requireSession } from "@/auth/require-session";
import {
  createTwoFactorSetup,
  decryptTotpSecret,
  generateRecoveryCodes,
  matchingTotpCounter,
  recoveryCodeHash,
} from "@/auth/two-factor";
import { prisma } from "@/db/client";
import { requestHeaders } from "@/http/request-headers";
import { resolveClientIp } from "@/security/client-ip";
import { consumeTwoFactorAttempt } from "@/security/two-factor-rate-limit";
import { getEnv } from "@/config/env";
import { currentUserId } from "@/workspace/current-user";

const invalidResult = { ok: false as const, message: "Código inválido ou expirado." };

async function allowAttempt(request: FastifyRequest) {
  const userId = currentUserId(request);
  const clientIp = resolveClientIp(requestHeaders(request), getEnv().TRUSTED_PROXY_HEADER);
  return consumeTwoFactorAttempt(userId, clientIp);
}

export function registerTwoFactorRoutes(app: FastifyInstance) {
  app.register(async (primary) => {
    primary.addHook("preHandler", requirePrimarySession);
    primary.addHook("onSend", async (_request, reply, payload) => {
      reply.header("Cache-Control", "no-store");
      reply.header("Pragma", "no-cache");
      return payload;
    });

    primary.get("/api/auth/2fa/status", async (request) => {
      const userId = currentUserId(request);
      const [user, recoveryCodesRemaining] = await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { twoFactorEnabledAt: true },
        }),
        prisma.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } }),
      ]);
      return { enabled: Boolean(user.twoFactorEnabledAt), recoveryCodesRemaining };
    });

    primary.post("/api/auth/2fa/setup", async (request) =>
      createTwoFactorSetup(currentUserId(request)),
    );

    primary.post("/api/auth/2fa/enable", async (request) => {
      if (!(await allowAttempt(request))) return invalidResult;
      const userId = currentUserId(request);
      const { code } = twoFactorCodeInput.parse(request.body);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.twoFactorPendingSecretEncrypted || user.twoFactorEnabledAt) return invalidResult;
      const secret = decryptTotpSecret(userId, user.twoFactorPendingSecretEncrypted);
      const counter = matchingTotpCounter(secret, code);
      if (counter === null) return invalidResult;
      const recoveryCodes = generateRecoveryCodes();
      const enabled = await prisma.$transaction(async (tx) => {
        const claimed = await tx.user.updateMany({
          where: {
            id: userId,
            twoFactorEnabledAt: null,
            twoFactorPendingSecretEncrypted: user.twoFactorPendingSecretEncrypted,
          },
          data: {
            twoFactorSecretEncrypted: user.twoFactorPendingSecretEncrypted,
            twoFactorPendingSecretEncrypted: null,
            twoFactorEnabledAt: new Date(),
            twoFactorLastUsedCounter: counter,
          },
        });
        if (claimed.count === 0) return false;
        await tx.twoFactorRecoveryCode.deleteMany({ where: { userId } });
        await tx.twoFactorRecoveryCode.createMany({
          data: recoveryCodes.map((recoveryCode) => ({
            userId,
            codeHash: recoveryCodeHash(userId, recoveryCode),
          })),
        });
        await tx.session.update({
          where: { id: request.sessionId! },
          data: { twoFactorVerifiedAt: new Date() },
        });
        return true;
      });
      if (!enabled) return invalidResult;
      return { ok: true as const, recoveryCodes };
    });

    primary.post("/api/auth/2fa/verify", async (request) => {
      if (!(await allowAttempt(request))) return invalidResult;
      const userId = currentUserId(request);
      const { code } = twoFactorCodeInput.parse(request.body);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.twoFactorSecretEncrypted || !user.twoFactorEnabledAt) return invalidResult;
      const secret = decryptTotpSecret(userId, user.twoFactorSecretEncrypted);
      const counter = matchingTotpCounter(secret, code);

      if (counter !== null) {
        const accepted = await prisma.user.updateMany({
          where: {
            id: userId,
            OR: [{ twoFactorLastUsedCounter: null }, { twoFactorLastUsedCounter: { lt: counter } }],
          },
          data: { twoFactorLastUsedCounter: counter },
        });
        if (accepted.count === 0) return invalidResult;
      } else {
        const used = await prisma.twoFactorRecoveryCode.updateMany({
          where: { userId, codeHash: recoveryCodeHash(userId, code), usedAt: null },
          data: { usedAt: new Date() },
        });
        if (used.count === 0) return invalidResult;
      }

      await prisma.session.update({
        where: { id: request.sessionId! },
        data: { twoFactorVerifiedAt: new Date() },
      });
      return { ok: true as const };
    });
  });

  app.post(
    "/api/auth/2fa/recovery-codes",
    { preHandler: requireSession },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      reply.header("Pragma", "no-cache");
      if (!(await allowAttempt(request))) return invalidResult;
      const userId = currentUserId(request);
      const { code } = twoFactorCodeInput.parse(request.body);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.twoFactorSecretEncrypted) return invalidResult;
      const counter = matchingTotpCounter(
        decryptTotpSecret(userId, user.twoFactorSecretEncrypted),
        code,
      );
      if (counter === null || (user.twoFactorLastUsedCounter ?? -1) >= counter)
        return invalidResult;
      const recoveryCodes = generateRecoveryCodes();
      const regenerated = await prisma.$transaction(async (tx) => {
        const accepted = await tx.user.updateMany({
          where: {
            id: userId,
            OR: [{ twoFactorLastUsedCounter: null }, { twoFactorLastUsedCounter: { lt: counter } }],
          },
          data: { twoFactorLastUsedCounter: counter },
        });
        if (accepted.count === 0) return false;
        await tx.twoFactorRecoveryCode.deleteMany({ where: { userId } });
        await tx.twoFactorRecoveryCode.createMany({
          data: recoveryCodes.map((recoveryCode) => ({
            userId,
            codeHash: recoveryCodeHash(userId, recoveryCode),
          })),
        });
        return true;
      });
      return regenerated ? { ok: true as const, recoveryCodes } : invalidResult;
    },
  );
}
