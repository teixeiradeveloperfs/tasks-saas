import { beforeEach, describe, expect, it } from "vitest";

import { resetDatabase } from "@/db/testing";
import { readCurrentUser } from "@/auth/current-user-read";
import { createSession } from "@/auth/session";
import { prisma } from "@/db/client";
import { seed } from "../../prisma/seed";

describe("readCurrentUser", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seeded = await seed();
    userId = seeded.users.voce.id;
  });

  it("devolve não autenticado quando não há token, sem lançar", async () => {
    await expect(readCurrentUser(undefined)).resolves.toEqual({ authenticated: false });
  });

  it("devolve não autenticado quando o token não existe", async () => {
    await expect(readCurrentUser("token-que-nao-existe")).resolves.toEqual({
      authenticated: false,
    });
  });

  it("devolve autenticado com o id do usuário quando o token é válido", async () => {
    const { token } = await createSession(userId);
    await expect(readCurrentUser(token)).resolves.toEqual({
      authenticated: true,
      userId,
      twoFactor: "setup_required",
    });
  });

  it("distingue desafio pendente de sessão com segundo fator confirmado", async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabledAt: new Date(), twoFactorSecretEncrypted: "encrypted" },
    });
    const { token, session } = await createSession(userId);
    await expect(readCurrentUser(token)).resolves.toMatchObject({
      authenticated: true,
      twoFactor: "challenge_required",
    });
    await prisma.session.update({
      where: { id: session.id },
      data: { twoFactorVerifiedAt: new Date() },
    });
    await expect(readCurrentUser(token)).resolves.toMatchObject({
      authenticated: true,
      twoFactor: "verified",
    });
  });
});
