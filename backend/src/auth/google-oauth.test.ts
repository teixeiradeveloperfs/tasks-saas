import { beforeEach, describe, expect, it } from "vitest";

import { findOrCreateGoogleUser, GoogleAuthError } from "@/auth/google-oauth";
import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import { seed } from "../../prisma/seed";

describe("Google OAuth", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("cria usuário e workspace no primeiro cadastro", async () => {
    const user = await findOrCreateGoogleUser({
      subject: "google-new-user",
      email: "nova@example.com",
      name: "Nova Pessoa",
    });

    expect(user).toMatchObject({
      email: "nova@example.com",
      name: "Nova Pessoa",
      googleSubject: "google-new-user",
    });
    expect(await prisma.workspaceMember.count({ where: { userId: user.id } })).toBe(1);
  });

  it("vincula uma conta existente pelo e-mail verificado sem duplicar nem alterar o perfil", async () => {
    const { users } = await seed();
    const before = await prisma.user.count();
    const linked = await findOrCreateGoogleUser({
      subject: "google-ana",
      email: "ana@acme.com",
      name: "Nome vindo do Google",
    });

    expect(linked.id).toBe(users.ana.id);
    expect(linked).toMatchObject({ name: "Ana Souza", googleSubject: "google-ana" });
    expect(await prisma.user.count()).toBe(before);
  });

  it("recusa colisão entre subject e e-mail de contas diferentes", async () => {
    const { users } = await seed();
    await prisma.user.update({
      where: { id: users.ana.id },
      data: { googleSubject: "google-subject" },
    });

    await expect(
      findOrCreateGoogleUser({
        subject: "google-subject",
        email: "bruno@acme.com",
        name: "Outra pessoa",
      }),
    ).rejects.toBeInstanceOf(GoogleAuthError);
  });
});
