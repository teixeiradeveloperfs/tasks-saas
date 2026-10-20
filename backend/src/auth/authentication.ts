import { hashPassword, verifyPassword } from "@/security/password";
import { prisma } from "@/db/client";
import { createSession, revokeSession } from "@/auth/session";

const GENERIC_LOGIN_ERROR = "E-mail ou senha inválidos.";
let dummyHashPromise: Promise<string> | undefined;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("flow-dummy-password-that-is-never-accepted");
  return dummyHashPromise;
}

export class AuthError extends Error {
  constructor(public readonly code: "email_taken" | "invalid_credentials" | "account_locked") {
    super(code === "email_taken" ? "Este e-mail já está cadastrado." : GENERIC_LOGIN_ERROR);
  }
}

export async function signUp(input: { name: string; email: string; password: string }) {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email,
          passwordHash,
          passwordUpdatedAt: new Date(),
          avatarColor: "#0086f2",
        },
      });
      await tx.workspace.create({
        data: {
          name: `${input.name} — Workspace`,
          color: "#0086f2",
          members: { create: { userId: created.id, title: "Owner", permission: "OWNER" } },
          projects: {
            create: {
              name: "Projeto padrão",
              color: created.avatarColor,
              boardColumns: {
                create: [
                  { name: "A fazer", status: "todo", color: "#94a3b8", position: 0 },
                  { name: "Em progresso", status: "in_progress", color: "#0086f2", position: 1 },
                  { name: "Concluído", status: "done", color: "#22c55e", position: 2 },
                ],
              },
            },
          },
        },
      });
      return created;
    });
    return user;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint"))
      throw new AuthError("email_taken");
    throw error;
  }
}

export async function signIn(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const user = await prisma.user.findUnique({ where: { email } });
  const candidateHash = user?.passwordHash ?? (await dummyHash());

  if (user?.lockedUntil && user.lockedUntil > new Date()) throw new AuthError("account_locked");
  const valid = await verifyPassword(candidateHash, password);
  if (!user || !user.passwordHash || !valid) {
    if (user) {
      const failedLoginCount = user.failedLoginCount + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount,
          lockedUntil: failedLoginCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      });
    }
    throw new AuthError("invalid_credentials");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
  return user;
}

export async function issueSession(userId: string, previousToken?: string) {
  if (previousToken) await revokeSession(previousToken);
  return createSession(userId);
}

export async function rotateLoginSession(token: string, userId: string) {
  await revokeSession(token);
  return createSession(userId);
}
