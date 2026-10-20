import type { Runbook, Workspace } from "@task-flow/shared/domain/models";
import type { RunbookInput, RunbookPatch } from "@task-flow/shared/domain/workspace-contracts";

import {
  accessibleProjectFilter,
  assertProjectAccess,
  assertWorkspaceEditor,
  assertWorkspaceMember,
  NotFoundError,
} from "@/auth/authorization";
import { prisma } from "@/db/client";
import { recordAudit } from "@/workspace/audit-repository";
import { mapWorkspace, workspaceIncludeFor } from "@/workspace/workspace-mapping";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function readWorkspace(tx: Tx, workspaceId: string, userId: string): Promise<Workspace> {
  const workspace = await tx.workspace.findUnique({
    where: { id: workspaceId },
    include: workspaceIncludeFor(userId),
  });
  if (!workspace) throw new NotFoundError();
  return mapWorkspace(workspace, userId);
}

async function resolveProject(tx: Tx, workspaceId: string, userId: string, requestedId?: string) {
  const project = await tx.project.findFirst({
    where: {
      ...(requestedId ? { id: requestedId } : {}),
      workspaceId,
      ...accessibleProjectFilter(userId),
    },
    orderBy: requestedId ? undefined : { createdAt: "asc" },
    select: { id: true },
  });
  if (!project) throw new NotFoundError();
  return project.id;
}

function nestedData(input: Pick<RunbookInput, "steps" | "variables">) {
  return {
    steps: input.steps.map((step, position) => ({
      title: step.title,
      command: step.command,
      explanation: step.explanation || null,
      expectedResult: step.expectedResult || null,
      risk: step.risk,
      position,
    })),
    variables: input.variables.map((variable, position) => ({
      key: variable.key,
      defaultValue: variable.defaultValue || null,
      description: variable.description || null,
      position,
    })),
  };
}

function findMappedRunbook(workspace: Workspace, id: string): Runbook {
  const runbook = workspace.runbooks.find((item) => item.id === id);
  if (!runbook) throw new NotFoundError();
  return runbook;
}

export async function createRunbook(
  workspaceId: string,
  input: RunbookInput,
  userId: string,
): Promise<{ runbook: Runbook; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    await assertWorkspaceEditor(tx, userId, workspaceId);
    const projectId = await resolveProject(tx, workspaceId, userId, input.projectId);
    const nested = nestedData(input);
    const created = await tx.runbook.create({
      data: {
        workspaceId,
        projectId,
        title: input.title,
        description: input.description || null,
        category: input.category,
        environment: input.environment,
        tags: [...new Set(input.tags)],
        steps: { create: nested.steps },
        variables: { create: nested.variables },
      },
    });
    await recordAudit(tx, {
      workspaceId,
      actorId: userId,
      action: "runbook.created",
      entityType: "runbook",
      entityId: created.id,
      summary: `criou o runbook “${created.title}”`,
      after: created,
    });
    const workspace = await readWorkspace(tx, workspaceId, userId);
    return { runbook: findMappedRunbook(workspace, created.id), workspace };
  });
}

export async function updateRunbook(
  id: string,
  patch: RunbookPatch,
  userId: string,
): Promise<{ runbook: Runbook; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.runbook.findUnique({ where: { id } });
    if (!current) throw new NotFoundError();
    await assertWorkspaceEditor(tx, userId, current.workspaceId);
    await assertProjectAccess(tx, userId, current.projectId);
    const projectId = patch.projectId
      ? await resolveProject(tx, current.workspaceId, userId, patch.projectId)
      : undefined;

    await tx.runbook.update({
      where: { id },
      data: {
        ...(projectId && { projectId }),
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.description !== undefined && { description: patch.description || null }),
        ...(patch.category !== undefined && { category: patch.category }),
        ...(patch.environment !== undefined && { environment: patch.environment }),
        ...(patch.tags !== undefined && { tags: [...new Set(patch.tags)] }),
      },
    });
    if (patch.steps !== undefined) {
      await tx.runbookStep.deleteMany({ where: { runbookId: id } });
      await tx.runbookStep.createMany({
        data: nestedData({ steps: patch.steps, variables: [] }).steps.map((step) => ({
          ...step,
          runbookId: id,
        })),
      });
    }
    if (patch.variables !== undefined) {
      await tx.runbookVariable.deleteMany({ where: { runbookId: id } });
      await tx.runbookVariable.createMany({
        data: nestedData({ steps: [], variables: patch.variables }).variables.map((variable) => ({
          ...variable,
          runbookId: id,
        })),
      });
    }
    const updated = await tx.runbook.findUniqueOrThrow({ where: { id } });
    await recordAudit(tx, {
      workspaceId: current.workspaceId,
      actorId: userId,
      action: "runbook.updated",
      entityType: "runbook",
      entityId: id,
      summary: `atualizou o runbook “${updated.title}”`,
      before: current,
      after: updated,
    });
    const workspace = await readWorkspace(tx, current.workspaceId, userId);
    return { runbook: findMappedRunbook(workspace, id), workspace };
  });
}

export async function deleteRunbook(id: string, userId: string): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const runbook = await tx.runbook.findUnique({ where: { id } });
    if (!runbook) throw new NotFoundError();
    await assertWorkspaceEditor(tx, userId, runbook.workspaceId);
    await assertProjectAccess(tx, userId, runbook.projectId);
    await tx.runbook.delete({ where: { id } });
    await recordAudit(tx, {
      workspaceId: runbook.workspaceId,
      actorId: userId,
      action: "runbook.deleted",
      entityType: "runbook",
      entityId: id,
      summary: `excluiu o runbook “${runbook.title}”`,
      before: runbook,
    });
    return { workspace: await readWorkspace(tx, runbook.workspaceId, userId) };
  });
}

export async function toggleRunbookFavorite(
  id: string,
  userId: string,
): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const runbook = await tx.runbook.findUnique({
      where: { id },
      select: { workspaceId: true, projectId: true },
    });
    if (!runbook) throw new NotFoundError();
    await assertWorkspaceMember(tx, userId, runbook.workspaceId);
    await assertProjectAccess(tx, userId, runbook.projectId);
    const key = { userId_runbookId: { userId, runbookId: id } };
    const favorite = await tx.runbookFavorite.findUnique({ where: key });
    if (favorite) await tx.runbookFavorite.delete({ where: key });
    else await tx.runbookFavorite.create({ data: { userId, runbookId: id } });
    return { workspace: await readWorkspace(tx, runbook.workspaceId, userId) };
  });
}

export async function toggleRunbookStep(
  id: string,
  userId: string,
): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const step = await tx.runbookStep.findUnique({
      where: { id },
      include: { runbook: { select: { workspaceId: true, projectId: true } } },
    });
    if (!step) throw new NotFoundError();
    await assertWorkspaceEditor(tx, userId, step.runbook.workspaceId);
    await assertProjectAccess(tx, userId, step.runbook.projectId);
    await tx.runbookStep.update({ where: { id }, data: { checked: !step.checked } });
    return { workspace: await readWorkspace(tx, step.runbook.workspaceId, userId) };
  });
}
