import { prisma } from "@/db/client";
import type { ProjectWhereInput } from "@/generated/prisma/models/Project";

export class NotFoundError extends Error {
  statusCode = 404;
  statusMessage = "Recurso não encontrado.";
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function assertWorkspaceMember(
  tx: Tx,
  userId: string | undefined,
  workspaceId: string,
) {
  if (!userId) return;
  const member = await tx.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true, permission: true },
  });
  if (!member) throw new NotFoundError();
  return member;
}

export async function assertWorkspaceEditor(
  tx: Tx,
  userId: string | undefined,
  workspaceId: string,
) {
  const member = await assertWorkspaceMember(tx, userId, workspaceId);
  if (member && member.permission === "VIEWER") throw new NotFoundError();
  return member;
}

export async function assertWorkspaceAdmin(
  tx: Tx,
  userId: string | undefined,
  workspaceId: string,
) {
  const member = await assertWorkspaceMember(tx, userId, workspaceId);
  if (member && member.permission !== "OWNER" && member.permission !== "ADMIN") {
    throw new NotFoundError();
  }
  return member;
}

// ---------------------------------------------------------------------------
// Acesso por projeto
//
// Um membro comum enxerga apenas os projetos em que tem concessão; OWNER e ADMIN
// enxergam todos os do workspace. Os helpers abaixo exigem `userId` e nunca
// retornam cedo: os de workspace acima liberam quando o id é indefinido, o que
// aqui significaria abrir justamente o que se quer fechar.
// ---------------------------------------------------------------------------

/** Fragmento de `where` para o model `Project`. */
export function accessibleProjectFilter(userId: string): ProjectWhereInput {
  return {
    OR: [
      { members: { some: { userId } } },
      { workspace: { members: { some: { userId, permission: { in: ["OWNER", "ADMIN"] } } } } },
    ],
  };
}

/** Fragmento de `where` para qualquer model que tenha `projectId` obrigatório. */
export function projectScoped(userId: string) {
  return { project: accessibleProjectFilter(userId) };
}

export async function assertProjectAccess(tx: Tx, userId: string, projectId: string) {
  const project = await tx.project.findFirst({
    where: { id: projectId, ...accessibleProjectFilter(userId) },
    select: { id: true },
  });
  if (!project) throw new NotFoundError();
}

export async function assertProjectAccessAll(tx: Tx, userId: string, projectIds: string[]) {
  const unique = [...new Set(projectIds)];
  if (unique.length === 0) return;
  const count = await tx.project.count({
    where: { id: { in: unique }, ...accessibleProjectFilter(userId) },
  });
  if (count !== unique.length) throw new NotFoundError();
}

/** Ids dos projetos que o usuário enxerga num workspace. */
export async function accessibleProjectIds(tx: Tx, userId: string, workspaceId: string) {
  const projects = await tx.project.findMany({
    where: { workspaceId, ...accessibleProjectFilter(userId) },
    select: { id: true },
  });
  return projects.map((project) => project.id);
}

export async function assertTaskMember(tx: Tx, userId: string | undefined, taskId: string) {
  if (!userId) return;
  const task = await tx.task.findFirst({
    where: {
      id: taskId,
      workspace: { members: { some: { userId } } },
      ...projectScoped(userId),
    },
    select: { id: true },
  });
  if (!task) throw new NotFoundError();
}

export async function assertTaskEditor(tx: Tx, userId: string | undefined, taskId: string) {
  if (!userId) return;
  const task = await tx.task.findFirst({
    where: {
      id: taskId,
      workspace: {
        members: {
          some: { userId, permission: { in: ["OWNER", "ADMIN", "MEMBER"] } },
        },
      },
      ...projectScoped(userId),
    },
    select: { id: true },
  });
  if (!task) throw new NotFoundError();
}
