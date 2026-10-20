import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/db/client";
import { AuthError, signIn, signUp } from "@/auth/authentication";
import { hashPassword } from "@/security/password";
import { resetDatabase } from "@/db/testing";
import { seed } from "../../prisma/seed";

describe("authentication", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seed();
  });

  it("creates a user with password and an owned workspace", async () => {
    const user = await signUp({
      name: "Nova Pessoa",
      email: "NOVA@EXAMPLE.COM",
      password: "uma senha muito segura",
    });
    expect(user.email).toBe("nova@example.com");
    expect(user.passwordHash).toBeTruthy();
    expect(await prisma.workspaceMember.count({ where: { userId: user.id } })).toBe(1);
  });

  it("does not reveal whether an email exists", async () => {
    await expect(signIn("nao-existe@example.com", "uma senha muito segura")).rejects.toMatchObject({
      code: "invalid_credentials",
    });
    await expect(signIn("voce@flow.app", "uma senha muito segura")).rejects.toMatchObject({
      code: "invalid_credentials",
    });
  });

  it("blocks repeated failures", async () => {
    await prisma.user.update({
      where: { email: "voce@flow.app" },
      data: { passwordHash: await hashPassword("senha correta muito longa"), failedLoginCount: 4 },
    });
    await expect(signIn("voce@flow.app", "uma senha muito segura")).rejects.toBeInstanceOf(
      AuthError,
    );
    const locked = await prisma.user.findUniqueOrThrow({ where: { email: "voce@flow.app" } });
    expect(locked.lockedUntil).toBeTruthy();
  });
});
