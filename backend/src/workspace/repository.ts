import { prisma } from "@/db/client";
import {
  assertTaskMember,
  assertWorkspaceEditor,
  assertWorkspaceMember,
  projectScoped,
} from "@/auth/authorization";
import { mapTask, taskInclude, toIso } from "@/workspace/task-mapping";
import { mapWorkspace, workspaceIncludeFor } from "@/workspace/workspace-mapping";
import type { BoardData, Profile, WorkspaceIntegration } from "@task-flow/shared/domain/models";

function boardIncludeFor(viewerUserId: string) {
  return {
    ...workspaceIncludeFor(viewerUserId),
    integrations: { orderBy: { connectedAt: "asc" as const } },
    tasks: {
      where: projectScoped(viewerUserId),
      include: taskInclude,
      orderBy: { createdAt: "asc" as const },
      take: 101,
    },
  } as const;
}

function mapIntegration(integration: {
  externalId: string;
  name: string;
  category: string;
  config: unknown;
  connectedAt: Date;
}): WorkspaceIntegration {
  return {
    id: integration.externalId,
    name: integration.name,
    category: integration.category,
    config: (integration.config as Record<string, string> | null) ?? undefined,
    connectedAt: integration.connectedAt.toISOString(),
  };
}

function mapProfile(user: Awaited<ReturnType<typeof queryUser>>): Profile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.title ?? "Membro",
    avatarColor: user.avatarColor,
    avatarUrl: user.avatarUrl ?? undefined,
    bio: user.bio ?? undefined,
    pinnedWorkspaces: user.pinnedWorkspaces.map((item) => item.workspaceId),
    pinnedTasks: user.pinnedTasks.map((item) => item.taskId),
    notificationsReadAt: toIso(user.notificationsReadAt),
  };
}

async function queryUser(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { pinnedWorkspaces: true, pinnedTasks: true },
  });
  if (!user) throw new Error(`Usuário da sessão não encontrado: ${email}`);
  return user;
}

async function queryUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { pinnedWorkspaces: true, pinnedTasks: true },
  });
  if (!user) throw new Error(`Usuário não encontrado: ${id}`);
  return user;
}

export async function updateProfile(
  userId: string,
  patch: {
    name?: string;
    email?: string;
    role?: string;
    bio?: string;
    avatarColor?: string;
    avatarUrl?: string | null;
  },
): Promise<Profile> {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.email !== undefined && { email: patch.email }),
        ...(patch.role !== undefined && { title: patch.role || null }),
        ...(patch.bio !== undefined && { bio: patch.bio || null }),
        ...(patch.avatarColor !== undefined && { avatarColor: patch.avatarColor }),
        ...(patch.avatarUrl !== undefined && { avatarUrl: patch.avatarUrl }),
      },
      include: { pinnedWorkspaces: true, pinnedTasks: true },
    });
    return mapProfile(user);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new ProfileEmailConflictError();
    }
    throw error;
  }
}

class ProfileEmailConflictError extends Error {
  statusCode = 409;
  statusMessage = "Este e-mail já está sendo usado por outra conta.";
}

export async function togglePinWorkspace(userId: string, workspaceId: string): Promise<Profile> {
  await prisma.$transaction(async (tx) => {
    await assertWorkspaceMember(tx, userId, workspaceId);
    const key = { userId_workspaceId: { userId, workspaceId } };
    const existing = await tx.pinnedWorkspace.findUnique({ where: key });
    if (existing) await tx.pinnedWorkspace.delete({ where: key });
    else await tx.pinnedWorkspace.create({ data: { userId, workspaceId } });
  });
  return mapProfile(await queryUserById(userId));
}

export async function togglePinTask(userId: string, taskId: string): Promise<Profile> {
  await prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, userId, taskId);
    const key = { userId_taskId: { userId, taskId } };
    const existing = await tx.pinnedTask.findUnique({ where: key });
    if (existing) await tx.pinnedTask.delete({ where: key });
    else await tx.pinnedTask.create({ data: { userId, taskId } });
  });
  return mapProfile(await queryUserById(userId));
}

export async function markNotificationsRead(userId: string): Promise<Profile> {
  await prisma.user.update({ where: { id: userId }, data: { notificationsReadAt: new Date() } });
  return mapProfile(await queryUserById(userId));
}

async function queryBoard(userId: string) {
  return prisma.workspace.findMany({
    where: { members: { some: { userId } } },
    include: boardIncludeFor(userId),
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
  });
}

/** Leitura por e-mail mantida para ferramentas de seed e testes; rotas usam sempre a sessão. */
export async function readBoardData(email: string): Promise<BoardData> {
  const user = await queryUser(email);
  const workspaces = await queryBoard(user.id);

  return {
    workspaces: workspaces.map((workspace) => mapWorkspace(workspace, user.id)),
    tasks: workspaces.flatMap((workspace) => workspace.tasks.map(mapTask)),
    profile: mapProfile(user),
    integrations: Object.fromEntries(
      workspaces.map((workspace) => [workspace.id, workspace.integrations.map(mapIntegration)]),
    ),
    taskPageInfo: Object.fromEntries(
      workspaces.map((workspace) => [
        workspace.id,
        {
          hasMore: workspace.tasks.length > 100,
          nextCursor:
            workspace.tasks.length > 100 ? workspace.tasks.slice(0, 100).at(-1)?.id : undefined,
        },
      ]),
    ),
  };
}

export async function readBoardDataForUser(userId: string): Promise<BoardData> {
  const user = await queryUserById(userId);
  const workspaces = await queryBoard(user.id);
  return {
    workspaces: workspaces.map((workspace) => mapWorkspace(workspace, user.id)),
    tasks: workspaces.flatMap((workspace) => workspace.tasks.slice(0, 100).map(mapTask)),
    profile: mapProfile(user),
    integrations: Object.fromEntries(
      workspaces.map((workspace) => [workspace.id, workspace.integrations.map(mapIntegration)]),
    ),
    taskPageInfo: Object.fromEntries(
      workspaces.map((workspace) => [
        workspace.id,
        {
          hasMore: workspace.tasks.length > 100,
          nextCursor:
            workspace.tasks.length > 100 ? workspace.tasks.slice(0, 100).at(-1)?.id : undefined,
        },
      ]),
    ),
  };
}

export async function readWorkspaceTasksPage(
  workspaceId: string,
  userId: string,
  cursor?: string,
  limit = 100,
) {
  return prisma.$transaction(async (tx) => {
    await assertWorkspaceMember(tx, userId, workspaceId);
    const records = await tx.task.findMany({
      where: { workspaceId, ...projectScoped(userId) },
      include: taskInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: Math.min(limit, 100) + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    const page = records.slice(0, Math.min(limit, 100));
    return {
      items: page.map(mapTask),
      hasMore: records.length > Math.min(limit, 100),
      nextCursor: records.length > Math.min(limit, 100) ? page.at(-1)?.id : undefined,
    };
  });
}

export async function toggleIntegration(
  workspaceId: string,
  data: Pick<WorkspaceIntegration, "id" | "name" | "category" | "config">,
  userId: string,
): Promise<WorkspaceIntegration[]> {
  return prisma.$transaction(async (tx) => {
    await assertWorkspaceEditor(tx, userId, workspaceId);
    const key = { workspaceId_externalId: { workspaceId, externalId: data.id } };
    const existing = await tx.integration.findUnique({ where: key });
    if (existing) await tx.integration.delete({ where: key });
    else {
      await tx.integration.create({
        data: {
          workspaceId,
          externalId: data.id,
          name: data.name,
          category: data.category,
          config: data.config,
        },
      });
    }
    return (
      await tx.integration.findMany({
        where: { workspaceId },
        orderBy: { connectedAt: "asc" },
      })
    ).map(mapIntegration);
  });
}

export async function updateIntegrationConfig(
  workspaceId: string,
  externalId: string,
  config: Record<string, string>,
  userId: string,
): Promise<WorkspaceIntegration[]> {
  return prisma.$transaction(async (tx) => {
    await assertWorkspaceEditor(tx, userId, workspaceId);
    await tx.integration.update({
      where: { workspaceId_externalId: { workspaceId, externalId } },
      data: { config },
    });
    return (
      await tx.integration.findMany({
        where: { workspaceId },
        orderBy: { connectedAt: "asc" },
      })
    ).map(mapIntegration);
  });
}
