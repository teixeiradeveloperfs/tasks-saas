import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/db/client";
import { hashPassword } from "@/security/password";
import { createSession } from "@/auth/session";
import { assertWorkspaceAdmin, NotFoundError } from "@/auth/authorization";
import { recordAudit } from "@/workspace/audit-repository";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

class InviteNameRequiredError extends Error {
  statusCode = 400;
  statusMessage = "Informe seu nome para criar a conta.";
}

class AlreadyWorkspaceMemberError extends Error {
  statusCode = 409;
  statusMessage = "Esta pessoa já faz parte do workspace.";
}

class ExistingAccountLoginRequiredError extends Error {
  statusCode = 409;
  statusMessage = "Esta conta já existe. Entre com ela para aceitar o convite.";
  code = "invite_login_required";
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

async function claimInvite(tx: Tx, token: string) {
  const invite = await tx.workspaceInvite.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) throw new NotFoundError();

  const acceptedAt = new Date();
  const claim = await tx.workspaceInvite.updateMany({
    where: { id: invite.id, acceptedAt: null, expiresAt: { gt: acceptedAt } },
    data: { acceptedAt },
  });
  if (claim.count !== 1) throw new NotFoundError();
  return { invite, acceptedAt };
}

async function attachInvitedUser(
  tx: Tx,
  input: {
    invite: Awaited<ReturnType<typeof claimInvite>>["invite"];
    acceptedAt: Date;
    user: { id: string; email: string };
    role?: string;
  },
) {
  const { invite, acceptedAt, user } = input;
  await tx.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
    update: { title: input.role?.trim() || null, permission: invite.permission },
    create: {
      workspaceId: invite.workspaceId,
      userId: user.id,
      title: input.role?.trim() || null,
      permission: invite.permission,
    },
  });

  // Os projetos escolhidos no convite viram acesso agora. A lista é conferida
  // contra o workspace porque um projeto pode ter sido excluído nos sete dias
  // entre convidar e aceitar.
  if (invite.projectIds.length > 0) {
    const projects = await tx.project.findMany({
      where: { id: { in: invite.projectIds }, workspaceId: invite.workspaceId },
      select: { id: true },
    });
    await tx.projectMember.createMany({
      data: projects.map((project) => ({ projectId: project.id, userId: user.id })),
      skipDuplicates: true,
    });
  }
  await tx.workspaceInvite.update({
    where: { id: invite.id },
    data: { invitedUserId: user.id },
  });
  await tx.workspaceInvite.updateMany({
    where: {
      id: { not: invite.id },
      workspaceId: invite.workspaceId,
      email: invite.email,
      acceptedAt: null,
    },
    data: { acceptedAt },
  });
  await recordAudit(tx, {
    workspaceId: invite.workspaceId,
    actorId: user.id,
    action: "invite.accepted",
    entityType: "member",
    entityId: user.id,
    summary: "aceitou o convite para o workspace",
    after: { email: user.email, permission: invite.permission },
  });
  return { userId: user.id, workspaceId: invite.workspaceId };
}

export async function createWorkspaceInvite(input: {
  workspaceId: string;
  invitedById: string;
  email: string;
  permission?: "ADMIN" | "MEMBER" | "VIEWER";
  projectIds?: string[];
}) {
  const email = normalizeEmail(input.email);
  const token = newToken();

  await prisma.$transaction(async (tx) => {
    await assertWorkspaceAdmin(tx, input.invitedById, input.workspaceId);
    const existingMember = await tx.workspaceMember.findFirst({
      where: { workspaceId: input.workspaceId, user: { email } },
      select: { id: true },
    });
    if (existingMember) throw new AlreadyWorkspaceMemberError();

    // Só projetos deste workspace entram no convite: um id de fora abriria acesso
    // a um projeto alheio no momento do aceite.
    const projects = await tx.project.findMany({
      where: { id: { in: [...new Set(input.projectIds ?? [])] }, workspaceId: input.workspaceId },
      select: { id: true },
    });

    const invite = await tx.workspaceInvite.create({
      data: {
        workspaceId: input.workspaceId,
        invitedById: input.invitedById,
        email,
        // Mantido por compatibilidade com a coluna histórica; os dados pessoais
        // são preenchidos pelo convidado somente quando ele abre o link.
        name: email,
        role: null,
        permission: input.permission ?? "MEMBER",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        projectIds: projects.map((project) => project.id),
      },
    });
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: input.invitedById,
      action: "invite.created",
      entityType: "invite",
      entityId: invite.id,
      summary: `convidou “${invite.email}” como ${invite.permission.toLowerCase()}`,
      after: { email: invite.email, permission: invite.permission },
    });
  });

  return { token, path: `/invite/${token}`, expiresInDays: 7 };
}

export async function acceptWorkspaceInvite(input: {
  token: string;
  name?: string;
  role?: string;
  password: string;
}) {
  // Esta rota cria somente contas novas. Contas existentes autenticam pelo fluxo
  // normal (inclusive Google) e usam acceptWorkspaceInviteAsUser.
  const preview = await prisma.workspaceInvite.findUnique({
    where: { tokenHash: hashToken(input.token) },
  });
  if (!preview || preview.acceptedAt || preview.expiresAt <= new Date()) throw new NotFoundError();
  const previewUser = await prisma.user.findUnique({ where: { email: preview.email } });
  if (previewUser) throw new ExistingAccountLoginRequiredError();
  if (!input.name?.trim()) throw new InviteNameRequiredError();
  const passwordHash = await hashPassword(input.password);

  const result = await prisma.$transaction(async (tx) => {
    const { invite, acceptedAt } = await claimInvite(tx, input.token);
    const existing = await tx.user.findUnique({ where: { email: invite.email } });
    if (existing) throw new ExistingAccountLoginRequiredError();
    const user = await tx.user.create({
      data: {
        name: input.name!.trim(),
        email: invite.email,
        avatarColor: "#0086f2",
        passwordHash,
        passwordUpdatedAt: new Date(),
      },
    });
    return attachInvitedUser(tx, { invite, acceptedAt, user, role: input.role });
  });

  const session = await createSession(result.userId);
  return { ...result, token: session.token, expiresAt: session.session.expiresAt };
}

export async function acceptWorkspaceInviteAsUser(input: {
  token: string;
  userId: string;
  role?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const { invite, acceptedAt } = await claimInvite(tx, input.token);
    const user = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { id: true, email: true },
    });
    if (normalizeEmail(user.email) !== normalizeEmail(invite.email)) throw new NotFoundError();
    return attachInvitedUser(tx, { invite, acceptedAt, user, role: input.role });
  });
}

export async function getInvite(token: string, currentUserId?: string) {
  const invite = await prisma.workspaceInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { workspace: { select: { name: true } } },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) return null;
  const existingUser = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true },
  });
  return {
    email: invite.email,
    workspaceName: invite.workspace.name,
    hasAccount: Boolean(existingUser),
    authenticated: Boolean(currentUserId),
    authenticatedAsInvitee: Boolean(existingUser && existingUser.id === currentUserId),
  };
}
