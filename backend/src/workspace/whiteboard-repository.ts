import { randomUUID } from "node:crypto";

import type { Whiteboard, Workspace } from "@task-flow/shared/domain/models";
import type { WhiteboardPatch } from "@task-flow/shared/domain/workspace-contracts";

import {
  accessibleProjectFilter,
  assertProjectAccess,
  assertWorkspaceEditor,
  assertWorkspaceMember,
  NotFoundError,
} from "@/auth/authorization";
import { prisma } from "@/db/client";
import {
  decryptContentText,
  encryptContentText,
  whiteboardContentAad,
} from "@/security/content-encryption";
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

function whiteboardMeta(record: {
  id: string;
  projectId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}): Whiteboard {
  return {
    id: record.id,
    projectId: record.projectId,
    title: record.title,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function createWhiteboard(
  workspaceId: string,
  input: { title: string; projectId?: string },
  userId: string,
): Promise<{ whiteboard: Whiteboard; workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    await assertWorkspaceEditor(tx, userId, workspaceId);
    const projectId = await resolveProject(tx, workspaceId, userId, input.projectId);
    // O id nasce aqui porque o AAD da criptografia o inclui: assim a cena já é
    // gravada cifrada na própria criação, sem nunca existir linha em claro.
    const id = randomUUID();
    const created = await tx.whiteboard.create({
      data: {
        id,
        workspaceId,
        projectId,
        title: input.title,
        scene: encryptContentText("", whiteboardContentAad(workspaceId, id)),
      },
    });
    await recordAudit(tx, {
      workspaceId,
      actorId: userId,
      action: "whiteboard.created",
      entityType: "whiteboard",
      entityId: created.id,
      summary: `criou o quadro “${created.title}”`,
    });
    return {
      whiteboard: whiteboardMeta(created),
      workspace: await readWorkspace(tx, workspaceId, userId),
    };
  });
}

/**
 * Leitura da cena, fora do payload do board de propósito: uma cena pode ter centenas
 * de KB e o board é carregado a todo momento. VIEWER pode ler — a restrição de
 * escrita fica nas mutações.
 */
export async function readWhiteboard(
  id: string,
  userId: string,
): Promise<Whiteboard & { scene: string }> {
  return prisma.$transaction(async (tx) => {
    const record = await tx.whiteboard.findUnique({ where: { id } });
    if (!record) throw new NotFoundError();
    await assertWorkspaceMember(tx, userId, record.workspaceId);
    await assertProjectAccess(tx, userId, record.projectId);
    return {
      ...whiteboardMeta(record),
      scene: decryptContentText(record.scene, whiteboardContentAad(record.workspaceId, record.id)),
    };
  });
}

export async function updateWhiteboard(
  id: string,
  patch: WhiteboardPatch,
  userId: string,
): Promise<{ whiteboard: Whiteboard }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.whiteboard.findUnique({ where: { id } });
    if (!current) throw new NotFoundError();
    await assertWorkspaceEditor(tx, userId, current.workspaceId);
    await assertProjectAccess(tx, userId, current.projectId);

    const updated = await tx.whiteboard.update({
      where: { id },
      data: {
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.scene !== undefined && {
          scene: encryptContentText(patch.scene, whiteboardContentAad(current.workspaceId, id)),
        }),
      },
    });

    // Só a troca de título vira evento; o salvamento automático da cena dispararia
    // um evento a cada pausa do traço, e cenas não entram em before/after — o
    // envelope criptografado inflaria a auditoria sem nada legível para mostrar.
    if (patch.title !== undefined && patch.title !== current.title) {
      await recordAudit(tx, {
        workspaceId: current.workspaceId,
        actorId: userId,
        action: "whiteboard.updated",
        entityType: "whiteboard",
        entityId: id,
        summary: `renomeou o quadro “${current.title}” para “${updated.title}”`,
        before: { title: current.title },
        after: { title: updated.title },
      });
    }

    return { whiteboard: whiteboardMeta(updated) };
  });
}

export async function deleteWhiteboard(
  id: string,
  userId: string,
): Promise<{ workspace: Workspace }> {
  return prisma.$transaction(async (tx) => {
    const record = await tx.whiteboard.findUnique({ where: { id } });
    if (!record) throw new NotFoundError();
    await assertWorkspaceEditor(tx, userId, record.workspaceId);
    await assertProjectAccess(tx, userId, record.projectId);
    await tx.whiteboard.delete({ where: { id } });
    await recordAudit(tx, {
      workspaceId: record.workspaceId,
      actorId: userId,
      action: "whiteboard.deleted",
      entityType: "whiteboard",
      entityId: id,
      summary: `excluiu o quadro “${record.title}”`,
    });
    return { workspace: await readWorkspace(tx, record.workspaceId, userId) };
  });
}
