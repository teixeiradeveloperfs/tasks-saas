import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import {
  cleanupExpiredSessions,
  createSession,
  readSession,
  revokeSession,
  rotateSession,
  SESSION_MAX_LIFETIME_MS,
} from "@/auth/session";
import { seed } from "../../prisma/seed";

describe("session", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seeded = await seed();
    userId = seeded.users.voce.id;
  });

  it("persiste somente hash e lê a sessão pelo token opaco", async () => {
    const created = await createSession(userId, { userAgent: "Vitest", ipAddress: "127.0.0.1" });
    const stored = await prisma.session.findUniqueOrThrow({ where: { id: created.session.id } });
    expect(stored.tokenHash).not.toBe(created.token);
    expect(stored.tokenHash).toHaveLength(64);
    expect((await readSession(created.token))?.user.id).toBe(userId);
  });

  it("rotaciona e revoga o token anterior", async () => {
    const first = await createSession(userId);
    const second = await rotateSession(first.token);
    expect(second?.token).not.toBe(first.token);
    expect(await readSession(first.token)).toBeNull();
    expect((await readSession(second!.token))?.user.id).toBe(userId);
    await revokeSession(second!.token);
    expect(await readSession(second!.token)).toBeNull();
  });

  it("renova sem trocar o token quando passa da metade do TTL", async () => {
    const created = await createSession(userId);
    const vinteDiasAtras = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    await prisma.session.update({
      where: { id: created.session.id },
      data: { createdAt: vinteDiasAtras },
    });

    const lida = await readSession(created.token);

    expect(lida).not.toBeNull();
    expect(lida!.token).toBe(created.token);
    expect(lida!.session.expiresAt.getTime()).toBeGreaterThan(created.session.expiresAt.getTime());
    expect(await prisma.session.count({ where: { userId, revokedAt: null } })).toBe(1);
  });

  it("aceita duas leituras concorrentes da mesma sessão renovada", async () => {
    const created = await createSession(userId);
    await prisma.session.update({
      where: { id: created.session.id },
      data: { createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) },
    });

    const [a, b] = await Promise.all([readSession(created.token), readSession(created.token)]);

    expect(a?.user.id).toBe(userId);
    expect(b?.user.id).toBe(userId);
  });

  it("continua recusando sessão revogada e sessão expirada", async () => {
    const revogada = await createSession(userId);
    await revokeSession(revogada.token);
    expect(await readSession(revogada.token)).toBeNull();

    const expirada = await createSession(userId);
    await prisma.session.update({
      where: { id: expirada.session.id },
      data: { expiresAt: new Date(0) },
    });
    expect(await readSession(expirada.token)).toBeNull();
  });

  it("recusa sessão que ultrapassou a duração absoluta", async () => {
    const created = await createSession(userId);
    await prisma.session.update({
      where: { id: created.session.id },
      data: {
        createdAt: new Date(Date.now() - SESSION_MAX_LIFETIME_MS - 1_000),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    expect(await readSession(created.token)).toBeNull();
  });

  it("remove sessões expiradas", async () => {
    const created = await createSession(userId);
    await prisma.session.update({
      where: { id: created.session.id },
      data: { expiresAt: new Date(0) },
    });
    expect(await cleanupExpiredSessions()).toBe(1);
  });
});
