import { prisma } from "@/db/client";
import { mapWorkspace, workspaceIncludeFor } from "@/workspace/workspace-mapping";
import { recordAudit } from "@/workspace/audit-repository";
import { randomUUID } from "node:crypto";
import {
  decryptContentText,
  documentContentAad,
  encryptContentText,
} from "@/security/content-encryption";
import {
  accessibleProjectFilter,
  assertProjectAccess,
  assertWorkspaceAdmin,
  assertWorkspaceEditor as assertWorkspaceMember,
  NotFoundError,
} from "@/auth/authorization";
import type {
  BoardColumn,
  CustomField,
  Automation,
  Doc,
  Goal,
  Member,
  Project,
  Sprint,
  Workspace,
  WorkspaceLabel,
} from "@task-flow/shared/domain/models";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const defaultBoardColumns = () => [
  { name: "A fazer", status: "todo" as const, color: "#94a3b8", position: 0 },
  { name: "Em progresso", status: "in_progress" as const, color: "#0086f2", position: 1 },
  { name: "Concluído", status: "done" as const, color: "#22c55e", position: 2 },
];

async function recordWorkspaceAudit(
  tx: Tx,
  actorId: string | undefined,
  input: {
    workspaceId: string;
    action: string;
    entityType: string;
    entityId?: string;
    summary: string;
    before?: unknown;
    after?: unknown;
  },
) {
  if (!actorId) return;
  await recordAudit(tx, { ...input, actorId });
}

// `viewerUserId` é obrigatório: o include filtra projetos e tudo que pende deles
// por quem está lendo, então um caminho sem espectador devolveria o workspace
// inteiro — exatamente o vazamento que o acesso por projeto existe para evitar.
async function readWorkspace(tx: Tx, id: string, viewerUserId: string): Promise<Workspace> {
  const record = await tx.workspace.findUnique({
    where: { id },
    include: workspaceIncludeFor(viewerUserId),
  });
  if (!record) throw new NotFoundError();
  return mapWorkspace(record, viewerUserId);
}

async function authorizeWorkspace(tx: Tx, userId: string | undefined, workspaceId: string) {
  const workspace = await tx.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!workspace) throw new NotFoundError();
  await assertWorkspaceMember(tx, userId, workspaceId);
}

async function authorizeResource(
  tx: Tx,
  userId: string | undefined,
  workspaceId: string | undefined,
) {
  if (!workspaceId) throw new NotFoundError();
  await authorizeWorkspace(tx, userId, workspaceId);
}

/**
 * Para recursos que vivem dentro de um projeto: ser membro do workspace não basta,
 * é preciso enxergar o projeto onde o recurso está. Sem isto, qualquer membro
 * alteraria um sprint, documento ou meta de um projeto que nem aparece para ele.
 */
async function authorizeProjectResource(
  tx: Tx,
  userId: string,
  resource: { workspaceId: string; projectId: string } | null | undefined,
) {
  if (!resource) throw new NotFoundError();
  await authorizeWorkspace(tx, userId, resource.workspaceId);
  await assertProjectAccess(tx, userId, resource.projectId);
}

async function assertGoalTargets(
  tx: Tx,
  workspaceId: string,
  projectId: string,
  taskIds: string[] = [],
  sprintIds: string[] = [],
) {
  const uniqueTaskIds = [...new Set(taskIds)];
  const uniqueSprintIds = [...new Set(sprintIds)];
  const [taskCount, sprintCount] = await Promise.all([
    tx.task.count({ where: { workspaceId, projectId, id: { in: uniqueTaskIds } } }),
    tx.sprint.count({ where: { workspaceId, projectId, id: { in: uniqueSprintIds } } }),
  ]);
  if (taskCount !== uniqueTaskIds.length || sprintCount !== uniqueSprintIds.length) {
    throw new NotFoundError();
  }
}

// Resolve sempre dentro do que o usuário enxerga: pedir um projeto ao qual não se
// tem acesso responde 404, e o palpite na ausência de pedido recai sobre o projeto
// acessível mais antigo, nunca sobre o mais antigo do workspace.
async function resolveProjectId(
  tx: Tx,
  workspaceId: string,
  userId: string,
  requestedId?: string,
): Promise<string> {
  if (requestedId) {
    const project = await tx.project.findFirst({
      where: { id: requestedId, workspaceId, ...accessibleProjectFilter(userId) },
      select: { id: true },
    });
    if (!project) throw new NotFoundError();
    return project.id;
  }
  const existing = await tx.project.findFirst({
    where: { workspaceId, ...accessibleProjectFilter(userId) },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Sem projeto acessível, criar um seria contornar o próprio acesso. Só quem
  // administra o workspace pode abrir o primeiro; para os demais, não há o que ver.
  const member = await tx.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { permission: true },
  });
  if (member?.permission !== "OWNER" && member?.permission !== "ADMIN") throw new NotFoundError();

  const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const project = await tx.project.create({
    data: {
      workspaceId,
      name: "Projeto padrão",
      color: workspace.color,
      boardColumns: { create: defaultBoardColumns() },
    },
  });
  return project.id;
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export type WorkspaceInput = {
  name: string;
  color: string;
  description?: string;
  imageUrl?: string | null;
};

/** Quem cria o workspace entra nele como Owner — senão ninguém enxergaria o que criou. */
export async function createWorkspace(input: WorkspaceInput, userId: string): Promise<Workspace> {
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name: input.name,
        color: input.color,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        members: { create: [{ userId, title: "Owner", permission: "OWNER" }] },
        projects: {
          create: [
            {
              name: "Projeto padrão",
              color: input.color,
              boardColumns: { create: defaultBoardColumns() },
              // Owner já enxergaria por cargo; a concessão explícita é para que
              // um rebaixamento futuro não lhe tire o projeto inicial.
              members: { create: [{ userId }] },
            },
          ],
        },
      },
    });

    await recordWorkspaceAudit(tx, userId, {
      workspaceId: workspace.id,
      action: "workspace.created",
      entityType: "workspace",
      entityId: workspace.id,
      summary: `criou o workspace “${workspace.name}”`,
      after: workspace,
    });

    return readWorkspace(tx, workspace.id, userId);
  });
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------

function projectRecord(record: {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: Date;
}): Project {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    description: record.description ?? undefined,
    color: record.color,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function createProject(
  workspaceId: string,
  input: { name: string; description?: string; color: string },
  userId: string,
): Promise<{ project: Project; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    await assertWorkspaceAdmin(tx, userId, workspaceId);
    const project = await tx.project.create({
      data: {
        workspaceId,
        name: input.name,
        description: input.description ?? null,
        color: input.color,
        boardColumns: { create: defaultBoardColumns() },
        // O projeto nasce restrito: só quem administra o workspace o enxerga, até
        // que alguém seja liberado na tela de Equipe. Quem criou ganha a concessão
        // explícita para não depender do próprio cargo — um rebaixamento futuro
        // não deve tirar dele o projeto que abriu.
        members: { create: [{ userId }] },
      },
    });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId,
      action: "project.created",
      entityType: "project",
      entityId: project.id,
      summary: `criou o projeto “${project.name}”`,
      after: project,
    });
    return {
      project: projectRecord(project),
      workspace: await readWorkspace(tx, workspaceId, userId),
    };
  });
}

export async function updateProject(
  id: string,
  patch: { name?: string; description?: string; color?: string },
  userId: string,
): Promise<{ project: Project; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.project.findUnique({ where: { id } });
    if (!current) throw new NotFoundError();
    await assertWorkspaceAdmin(tx, userId, current.workspaceId);
    const project = await tx.project.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.description !== undefined && { description: patch.description || null }),
        ...(patch.color !== undefined && { color: patch.color }),
      },
    });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: project.workspaceId,
      action: "project.updated",
      entityType: "project",
      entityId: project.id,
      summary: `atualizou o projeto “${project.name}”`,
      before: current,
      after: project,
    });
    return {
      project: projectRecord(project),
      workspace: await readWorkspace(tx, project.workspaceId, userId),
    };
  });
}

export async function createBoardColumn(
  projectId: string,
  input: { name: string; status: BoardColumn["status"]; color: string },
  userId: string,
): Promise<{ column: BoardColumn; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundError();
    await authorizeWorkspace(tx, userId, project.workspaceId);
    await assertProjectAccess(tx, userId, projectId);
    const last = await tx.boardColumn.findFirst({
      where: { projectId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const column = await tx.boardColumn.create({
      data: {
        projectId,
        name: input.name,
        status: input.status,
        color: input.color,
        position: (last?.position ?? -1) + 1,
      },
    });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: project.workspaceId,
      action: "board_column.created",
      entityType: "board_column",
      entityId: column.id,
      summary: `criou a coluna “${column.name}”`,
      after: column,
    });
    return {
      column: { ...column, createdAt: column.createdAt.toISOString() },
      workspace: await readWorkspace(tx, project.workspaceId, userId),
    };
  });
}

export async function updateWorkspace(
  id: string,
  patch: Partial<WorkspaceInput>,
  userId: string,
): Promise<Workspace> {
  return prisma.$transaction(async (tx) => {
    await assertWorkspaceAdmin(tx, userId, id);
    const before = await tx.workspace.findUniqueOrThrow({ where: { id } });
    const after = await tx.workspace.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.color !== undefined && { color: patch.color }),
        ...(patch.description !== undefined && { description: patch.description ?? null }),
        ...(patch.imageUrl !== undefined && { imageUrl: patch.imageUrl }),
      },
    });

    await recordWorkspaceAudit(tx, userId, {
      workspaceId: id,
      action: "workspace.updated",
      entityType: "workspace",
      entityId: id,
      summary: `atualizou o workspace “${after.name}”`,
      before,
      after,
    });

    return readWorkspace(tx, id, userId);
  });
}

/** Tarefas, etiquetas, sprints, docs e membresias somem por cascata, declarada no schema. */
export async function deleteWorkspace(id: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const member = await assertWorkspaceAdmin(tx, userId, id);
    if (member && member.permission !== "OWNER") throw new NotFoundError();
    await tx.workspace.delete({ where: { id } });
  });
}

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------

/**
 * Renomear é um UPDATE de uma linha, e não uma varredura por todas as tarefas: as
 * tarefas apontam para a etiqueta por id. Era a correção de modelagem prevista na
 * spec da fundação de dados.
 */
export async function createLabel(
  workspaceId: string,
  name: string,
  color: string,
  userId: string,
): Promise<WorkspaceLabel> {
  return prisma.$transaction(async (tx) => {
    await authorizeWorkspace(tx, userId, workspaceId);
    const label = await tx.label.create({ data: { workspaceId, name, color } });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId,
      action: "label.created",
      entityType: "label",
      entityId: label.id,
      summary: `criou a etiqueta “${label.name}”`,
      after: label,
    });
    return { id: label.id, name: label.name, color: label.color };
  });
}

export async function updateLabel(
  id: string,
  patch: { name?: string; color?: string },
  userId: string,
): Promise<WorkspaceLabel> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.label.findUnique({ where: { id } });
    await authorizeResource(tx, userId, current?.workspaceId);
    const label = await tx.label.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.color !== undefined && { color: patch.color }),
      },
    });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: label.workspaceId,
      action: "label.updated",
      entityType: "label",
      entityId: label.id,
      summary: `atualizou a etiqueta “${label.name}”`,
      before: current,
      after: label,
    });
    return { id: label.id, name: label.name, color: label.color };
  });
}

/** Os vínculos com tarefas somem por cascata. */
export async function deleteLabel(id: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const label = await tx.label.findUnique({ where: { id } });
    await authorizeResource(tx, userId, label?.workspaceId);
    if (!label) throw new NotFoundError();
    await tx.label.delete({ where: { id } });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: label.workspaceId,
      action: "label.deleted",
      entityType: "label",
      entityId: label.id,
      summary: `excluiu a etiqueta “${label.name}”`,
      before: label,
    });
  });
}

// ---------------------------------------------------------------------------
// Sprints e campos customizados
// ---------------------------------------------------------------------------

export type SprintInput = {
  workspaceId: string;
  projectId?: string;
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  status?: Sprint["status"];
  userId: string;
};

function sprintRecord(record: {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: Sprint["status"];
  createdAt: Date;
}): Sprint {
  return {
    id: record.id,
    projectId: record.projectId,
    name: record.name,
    goal: record.goal ?? undefined,
    startDate: record.startDate?.toISOString(),
    endDate: record.endDate?.toISOString(),
    status: record.status,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function createSprint(
  input: SprintInput,
): Promise<{ sprint: Sprint; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    await authorizeWorkspace(tx, input.userId, input.workspaceId);
    const projectId = await resolveProjectId(tx, input.workspaceId, input.userId, input.projectId);
    const sprint = await tx.sprint.create({
      data: {
        workspaceId: input.workspaceId,
        projectId,
        name: input.name,
        goal: input.goal ?? null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        status: input.status ?? "planned",
      },
    });
    await recordWorkspaceAudit(tx, input.userId, {
      workspaceId: input.workspaceId,
      action: "sprint.created",
      entityType: "sprint",
      entityId: sprint.id,
      summary: `criou o sprint “${sprint.name}”`,
      after: sprint,
    });
    return {
      sprint: sprintRecord(sprint),
      workspace: await readWorkspace(tx, input.workspaceId, input.userId),
    };
  });
}

export type SprintPatch = Partial<Omit<SprintInput, "workspaceId">>;

export async function updateSprint(
  id: string,
  patch: SprintPatch,
  userId: string,
): Promise<{ sprint: Sprint; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.sprint.findUnique({ where: { id } });
    await authorizeProjectResource(tx, userId, current);
    const sprint = await tx.sprint.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.goal !== undefined && { goal: patch.goal ?? null }),
        ...(patch.startDate !== undefined && {
          startDate: patch.startDate ? new Date(patch.startDate) : null,
        }),
        ...(patch.endDate !== undefined && {
          endDate: patch.endDate ? new Date(patch.endDate) : null,
        }),
        ...(patch.status !== undefined && { status: patch.status }),
      },
    });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: sprint.workspaceId,
      action: "sprint.updated",
      entityType: "sprint",
      entityId: sprint.id,
      summary: `atualizou o sprint “${sprint.name}”`,
      before: current,
      after: sprint,
    });
    return {
      sprint: sprintRecord(sprint),
      workspace: await readWorkspace(tx, sprint.workspaceId, userId),
    };
  });
}

export async function deleteSprint(id: string, userId: string): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const sprint = await tx.sprint.findUnique({ where: { id } });
    await authorizeProjectResource(tx, userId, sprint);
    if (!sprint) throw new NotFoundError();
    await tx.sprint.delete({ where: { id } });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: sprint.workspaceId,
      action: "sprint.deleted",
      entityType: "sprint",
      entityId: sprint.id,
      summary: `excluiu o sprint “${sprint.name}”`,
      before: sprint,
    });
    return { workspace: await readWorkspace(tx, sprint.workspaceId, userId) };
  });
}

export type CustomFieldInput = {
  workspaceId: string;
  name: string;
  type: CustomField["type"];
  options?: string[];
  userId: string;
};

function customFieldRecord(record: {
  id: string;
  name: string;
  type: CustomField["type"];
  options: string[];
}): CustomField {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    options: record.options.length ? record.options : undefined,
  };
}

export async function createCustomField(
  input: CustomFieldInput,
): Promise<{ field: CustomField; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    await authorizeWorkspace(tx, input.userId, input.workspaceId);
    const field = await tx.customField.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        type: input.type,
        options: input.options ?? [],
      },
    });
    await recordWorkspaceAudit(tx, input.userId, {
      workspaceId: input.workspaceId,
      action: "field.created",
      entityType: "field",
      entityId: field.id,
      summary: `criou o campo “${field.name}”`,
      after: field,
    });
    return {
      field: customFieldRecord(field),
      workspace: await readWorkspace(tx, input.workspaceId, input.userId),
    };
  });
}

export type CustomFieldPatch = Partial<Pick<CustomField, "name" | "type" | "options">>;

export async function updateCustomField(
  id: string,
  patch: CustomFieldPatch,
  userId: string,
): Promise<{ field: CustomField; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.customField.findUnique({ where: { id } });
    await authorizeResource(tx, userId, current?.workspaceId);
    const field = await tx.customField.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.type !== undefined && { type: patch.type }),
        ...(patch.options !== undefined && { options: patch.options ?? [] }),
      },
    });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: field.workspaceId,
      action: "field.updated",
      entityType: "field",
      entityId: field.id,
      summary: `atualizou o campo “${field.name}”`,
      before: current,
      after: field,
    });
    return {
      field: customFieldRecord(field),
      workspace: await readWorkspace(tx, field.workspaceId, userId),
    };
  });
}

export async function deleteCustomField(
  id: string,
  userId: string,
): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const field = await tx.customField.findUnique({ where: { id } });
    await authorizeResource(tx, userId, field?.workspaceId);
    if (!field) throw new NotFoundError();
    await tx.customField.delete({ where: { id } });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: field.workspaceId,
      action: "field.deleted",
      entityType: "field",
      entityId: field.id,
      summary: `excluiu o campo “${field.name}”`,
      before: field,
    });
    return { workspace: await readWorkspace(tx, field.workspaceId, userId) };
  });
}

// ---------------------------------------------------------------------------
// Metas, documentos e automações
// ---------------------------------------------------------------------------

function isoDate(value: string | undefined): Date | null {
  return value ? new Date(value) : null;
}

export async function createDoc(
  workspaceId: string,
  title: string,
  userId: string,
  requestedProjectId?: string,
): Promise<{ doc: Doc; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    await authorizeWorkspace(tx, userId, workspaceId);
    const projectId = await resolveProjectId(tx, workspaceId, userId, requestedProjectId);
    const id = randomUUID();
    const doc = await tx.doc.create({
      data: {
        id,
        workspaceId,
        projectId,
        title,
        body: encryptContentText("", documentContentAad(workspaceId, id)),
      },
    });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId,
      action: "doc.created",
      entityType: "doc",
      entityId: doc.id,
      summary: `criou o documento “${doc.title}”`,
      after: { id: doc.id, title: doc.title, projectId: doc.projectId },
    });
    return {
      doc: {
        id: doc.id,
        projectId: doc.projectId,
        title: doc.title,
        body: decryptContentText(doc.body, documentContentAad(doc.workspaceId, doc.id)),
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      },
      workspace: await readWorkspace(tx, workspaceId, userId),
    };
  });
}

export async function updateDoc(
  id: string,
  patch: Partial<Pick<Doc, "title" | "body">>,
  userId: string,
): Promise<{ doc: Doc; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.doc.findUnique({ where: { id } });
    await authorizeProjectResource(tx, userId, current);
    const storedPatch = {
      ...patch,
      ...(patch.body === undefined
        ? {}
        : { body: encryptContentText(patch.body, documentContentAad(current!.workspaceId, id)) }),
    };
    const doc = await tx.doc.update({ where: { id }, data: storedPatch });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: doc.workspaceId,
      action: "doc.updated",
      entityType: "doc",
      entityId: doc.id,
      summary: `atualizou o documento “${doc.title}”`,
      before: { id: current!.id, title: current!.title, projectId: current!.projectId },
      after: { id: doc.id, title: doc.title, projectId: doc.projectId },
    });
    return {
      doc: {
        id: doc.id,
        projectId: doc.projectId,
        title: doc.title,
        body: decryptContentText(doc.body, documentContentAad(doc.workspaceId, doc.id)),
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      },
      workspace: await readWorkspace(tx, doc.workspaceId, userId),
    };
  });
}

export async function deleteDoc(id: string, userId: string): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const doc = await tx.doc.findUnique({ where: { id } });
    await authorizeProjectResource(tx, userId, doc);
    if (!doc) throw new NotFoundError();
    await tx.doc.delete({ where: { id } });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: doc.workspaceId,
      action: "doc.deleted",
      entityType: "doc",
      entityId: doc.id,
      summary: `excluiu o documento “${doc.title}”`,
      before: { id: doc.id, title: doc.title, projectId: doc.projectId },
    });
    return { workspace: await readWorkspace(tx, doc.workspaceId, userId) };
  });
}

export type GoalInput = {
  workspaceId: string;
  projectId?: string;
  name: string;
  description?: string;
  dueDate?: string;
  taskIds?: string[];
  sprintIds?: string[];
  userId: string;
};

export async function createGoal(input: GoalInput): Promise<{ goal: Goal; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    await authorizeWorkspace(tx, input.userId, input.workspaceId);
    const projectId = await resolveProjectId(tx, input.workspaceId, input.userId, input.projectId);
    await assertGoalTargets(tx, input.workspaceId, projectId, input.taskIds, input.sprintIds);
    const goal = await tx.goal.create({
      data: {
        workspaceId: input.workspaceId,
        projectId,
        name: input.name,
        description: input.description ?? null,
        dueDate: isoDate(input.dueDate),
        tasks: { create: (input.taskIds ?? []).map((taskId) => ({ taskId })) },
        sprints: { create: (input.sprintIds ?? []).map((sprintId) => ({ sprintId })) },
      },
    });
    await recordWorkspaceAudit(tx, input.userId, {
      workspaceId: input.workspaceId,
      action: "goal.created",
      entityType: "goal",
      entityId: goal.id,
      summary: `criou a meta “${goal.name}”`,
      after: goal,
    });
    return {
      goal: {
        id: goal.id,
        projectId: goal.projectId,
        name: goal.name,
        description: goal.description ?? undefined,
        dueDate: goal.dueDate?.toISOString(),
        taskIds: input.taskIds ?? [],
        sprintIds: input.sprintIds ?? [],
        createdAt: goal.createdAt.toISOString(),
      },
      workspace: await readWorkspace(tx, input.workspaceId, input.userId),
    };
  });
}

export async function updateGoal(
  id: string,
  patch: Partial<GoalInput>,
  userId: string,
): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.goal.findUnique({ where: { id } });
    await authorizeProjectResource(tx, userId, current);
    if (!current) throw new NotFoundError();
    await assertGoalTargets(
      tx,
      current.workspaceId,
      current.projectId,
      patch.taskIds ?? [],
      patch.sprintIds ?? [],
    );
    const goal = await tx.goal.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.description !== undefined && { description: patch.description ?? null }),
        ...(patch.dueDate !== undefined && { dueDate: isoDate(patch.dueDate) }),
      },
    });
    if (patch.taskIds !== undefined) {
      await tx.goalTask.deleteMany({ where: { goalId: id } });
      await tx.goalTask.createMany({
        data: patch.taskIds.map((taskId) => ({ goalId: id, taskId })),
      });
    }
    if (patch.sprintIds !== undefined) {
      await tx.goalSprint.deleteMany({ where: { goalId: id } });
      await tx.goalSprint.createMany({
        data: patch.sprintIds.map((sprintId) => ({ goalId: id, sprintId })),
      });
    }
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: goal.workspaceId,
      action: "goal.updated",
      entityType: "goal",
      entityId: goal.id,
      summary: `atualizou a meta “${goal.name}”`,
      before: current,
      after: goal,
    });
    return { workspace: await readWorkspace(tx, goal.workspaceId, userId) };
  });
}

export async function deleteGoal(id: string, userId: string): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const goal = await tx.goal.findUnique({ where: { id } });
    await authorizeProjectResource(tx, userId, goal);
    if (!goal) throw new NotFoundError();
    await tx.goal.delete({ where: { id } });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: goal.workspaceId,
      action: "goal.deleted",
      entityType: "goal",
      entityId: goal.id,
      summary: `excluiu a meta “${goal.name}”`,
      before: goal,
    });
    return { workspace: await readWorkspace(tx, goal.workspaceId, userId) };
  });
}

export async function toggleGoalTask(
  goalId: string,
  taskId: string,
  userId: string,
): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const goal = await tx.goal.findUnique({ where: { id: goalId } });
    await authorizeProjectResource(tx, userId, goal);
    if (!goal) throw new NotFoundError();
    await assertGoalTargets(tx, goal.workspaceId, goal.projectId, [taskId]);
    const link = await tx.goalTask.findUnique({ where: { goalId_taskId: { goalId, taskId } } });
    if (link) await tx.goalTask.delete({ where: { goalId_taskId: { goalId, taskId } } });
    else await tx.goalTask.create({ data: { goalId, taskId } });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: goal.workspaceId,
      action: link ? "goal.task_removed" : "goal.task_added",
      entityType: "goal",
      entityId: goal.id,
      summary: `${link ? "removeu uma tarefa da" : "adicionou uma tarefa à"} meta “${goal.name}”`,
    });
    return { workspace: await readWorkspace(tx, goal.workspaceId, userId) };
  });
}

export async function toggleGoalSprint(
  goalId: string,
  sprintId: string,
  userId: string,
): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const goal = await tx.goal.findUnique({ where: { id: goalId } });
    await authorizeProjectResource(tx, userId, goal);
    if (!goal) throw new NotFoundError();
    await assertGoalTargets(tx, goal.workspaceId, goal.projectId, [], [sprintId]);
    const link = await tx.goalSprint.findUnique({
      where: { goalId_sprintId: { goalId, sprintId } },
    });
    if (link) await tx.goalSprint.delete({ where: { goalId_sprintId: { goalId, sprintId } } });
    else await tx.goalSprint.create({ data: { goalId, sprintId } });
    await recordWorkspaceAudit(tx, userId, {
      workspaceId: goal.workspaceId,
      action: link ? "goal.sprint_removed" : "goal.sprint_added",
      entityType: "goal",
      entityId: goal.id,
      summary: `${link ? "removeu um sprint da" : "adicionou um sprint à"} meta “${goal.name}”`,
    });
    return { workspace: await readWorkspace(tx, goal.workspaceId, userId) };
  });
}

export type AutomationInput = {
  workspaceId: string;
  name: string;
  enabled?: boolean;
  trigger: Automation["trigger"];
  action: Automation["action"];
  userId: string;
};

export async function createAutomation(input: AutomationInput): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    await authorizeWorkspace(tx, input.userId, input.workspaceId);
    await tx.automation.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        enabled: input.enabled ?? true,
        trigger: input.trigger,
        action: input.action,
      },
    });
    return { workspace: await readWorkspace(tx, input.workspaceId, input.userId) };
  });
}

export async function updateAutomation(
  id: string,
  patch: Partial<Omit<AutomationInput, "workspaceId">>,
  userId: string,
): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.automation.findUnique({
      where: { id },
      select: { workspaceId: true },
    });
    await authorizeResource(tx, userId, current?.workspaceId);
    const automation = await tx.automation.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.enabled !== undefined && { enabled: patch.enabled }),
        ...(patch.trigger !== undefined && { trigger: patch.trigger }),
        ...(patch.action !== undefined && { action: patch.action }),
      },
    });
    return { workspace: await readWorkspace(tx, automation.workspaceId, userId) };
  });
}

export async function deleteAutomation(
  id: string,
  userId: string,
): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const automation = await tx.automation.findUnique({ where: { id } });
    await authorizeResource(tx, userId, automation?.workspaceId);
    if (!automation) throw new NotFoundError();
    await tx.automation.delete({ where: { id } });
    return { workspace: await readWorkspace(tx, automation.workspaceId, userId) };
  });
}

// ---------------------------------------------------------------------------
// Membros
// ---------------------------------------------------------------------------

export type MemberInput = {
  name: string;
  email: string;
  color: string;
  role?: string;
};

/**
 * Um membro é um usuário de verdade ligado ao workspace, não mais um adesivo colorido.
 *
 * Sem cadastro por convite ainda, adicionar alguém cria a conta se ela não existir. O
 * e-mail é a identidade: informado, reaproveita quem já existe; ausente, um endereço
 * derivado do nome é gerado para satisfazer a unicidade — a pessoa ainda não tem como
 * entrar, mas passa a ser um usuário real, atribuível numa tarefa.
 */
export async function addMember(
  workspaceId: string,
  input: MemberInput,
  userId: string,
): Promise<{ member: Member; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    await authorizeWorkspace(tx, userId, workspaceId);
    const email = input.email.trim().toLowerCase();

    const user = await tx.user.upsert({
      where: { email },
      update: {},
      create: { name: input.name, email, avatarColor: input.color },
    });

    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      update: { title: input.role ?? null },
      create: { workspaceId, userId: user.id, title: input.role ?? null },
    });

    // Caminho legado, sem convite e sem interface: quem é adicionado assim recebe
    // todos os projetos, preservando o comportamento anterior ao acesso por projeto.
    // Pela tela de Equipe, quem define a lista é o convite.
    const projects = await tx.project.findMany({ where: { workspaceId }, select: { id: true } });
    await tx.projectMember.createMany({
      data: projects.map((project) => ({ projectId: project.id, userId: user.id })),
      skipDuplicates: true,
    });

    return {
      member: {
        id: user.id,
        name: user.name,
        color: user.avatarColor,
        email: user.email,
        role: input.role,
        permission: "MEMBER",
      },
      // Sem ator informado (só os testes fazem isso), o workspace é lido pelos
      // olhos de quem acabou de entrar.
      workspace: await readWorkspace(tx, workspaceId, userId ?? user.id),
    };
  });
}

/** Endereço estável e claramente interno, para quem foi adicionado sem e-mail. */
function derivedEmail(name: string): string {
  const slug =
    name
      .toLowerCase()
      .normalize("NFD")
      // Faixa dos acentos combinantes que o NFD separou das letras.
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "membro";

  throw new Error("A criação direta de membros foi descontinuada; use um convite.");
}

export async function updateMember(
  workspaceId: string,
  userId: string,
  patch: {
    role?: string;
    permission?: Member["permission"];
    projectIds?: string[];
  },
  actorId: string,
): Promise<Workspace> {
  return prisma.$transaction(async (tx) => {
    const actor = await assertWorkspaceAdmin(tx, actorId, workspaceId);
    const target = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { user: { select: { name: true } } },
    });
    if (!target) throw new NotFoundError();
    if (actor?.permission !== "OWNER" && target.permission === "OWNER") throw new NotFoundError();
    if (patch.permission === "OWNER" && actor?.permission !== "OWNER") throw new NotFoundError();
    if (patch.role !== undefined || patch.permission !== undefined) {
      await tx.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId } },
        data: {
          ...(patch.role !== undefined && { title: patch.role || null }),
          ...(patch.permission !== undefined && { permission: patch.permission }),
        },
      });
    }

    // A lista chega inteira e substitui a anterior. Restringe-se aos projetos deste
    // workspace: um id de fora concederia acesso a projeto alheio.
    if (patch.projectIds !== undefined) {
      const projects = await tx.project.findMany({
        where: { id: { in: [...new Set(patch.projectIds)] }, workspaceId },
        select: { id: true },
      });
      await tx.projectMember.deleteMany({ where: { userId, project: { workspaceId } } });
      await tx.projectMember.createMany({
        data: projects.map((project) => ({ projectId: project.id, userId })),
        skipDuplicates: true,
      });
    }

    const workspace = await readWorkspace(tx, workspaceId, actorId);
    const updated = workspace.members.find((member) => member.id === userId);
    await recordWorkspaceAudit(tx, actorId, {
      workspaceId,
      action: "member.updated",
      entityType: "member",
      entityId: userId,
      summary: `atualizou o membro “${updated?.name ?? target.user.name}”`,
      before: target,
      after: updated,
    });
    return workspace;
  });
}

/**
 * Remove a membresia, não o usuário: ele pode estar em outros workspaces, e os
 * comentários e apontamentos que deixou continuam precisando de autor.
 *
 * As tarefas deste workspace que estavam com ele ficam sem responsável. Isso não sai
 * de graça pelo schema: `onDelete: SetNull` em `Task.assignee` só dispara quando o
 * usuário some, e aqui ele continua existindo.
 */
export async function removeMember(
  workspaceId: string,
  userId: string,
  actorId: string,
): Promise<Workspace> {
  return prisma.$transaction(async (tx) => {
    const actor = await assertWorkspaceAdmin(tx, actorId, workspaceId);
    const target = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { user: { select: { name: true } } },
    });
    if (!target) throw new NotFoundError();
    if (target.permission === "OWNER") throw new NotFoundError();
    await tx.task.updateMany({
      where: { workspaceId, assigneeId: userId },
      data: { assigneeId: null },
    });
    await tx.taskAssignment.deleteMany({
      where: { userId, task: { workspaceId } },
    });

    // Pelo mesmo motivo do bloco acima: a cascata só dispara quando o usuário é
    // excluído, e ele continua existindo em outros workspaces. Sem isto, readmitir
    // a pessoa depois traria de volta os acessos antigos sem ninguém ter concedido.
    await tx.projectMember.deleteMany({ where: { userId, project: { workspaceId } } });

    await tx.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId } },
    });

    await recordWorkspaceAudit(tx, actorId, {
      workspaceId,
      action: "member.removed",
      entityType: "member",
      entityId: userId,
      summary: `removeu o membro “${target.user.name}”`,
      before: target,
    });

    return readWorkspace(tx, workspaceId, actorId);
  });
}
