import { prisma } from "@/db/client";
import { randomUUID } from "node:crypto";
import {
  attachmentContentAad,
  decryptContentBuffer,
  encryptContentBuffer,
} from "@/security/content-encryption";
import {
  accessibleProjectFilter,
  assertProjectAccess,
  assertTaskEditor as assertTaskMember,
  assertTaskMember as assertTaskReader,
  assertWorkspaceEditor as assertWorkspaceMember,
  NotFoundError,
  projectScoped,
} from "@/auth/authorization";
import { mapTask, taskInclude } from "@/workspace/task-mapping";
import { recordAudit } from "@/workspace/audit-repository";
import { priorityLabels, statusLabels } from "@task-flow/shared/domain/presentation";
import type { ActivityKind, Task, TaskPriority, TaskStatus } from "@task-flow/shared/domain/models";
import type { AttachmentInput } from "@task-flow/shared/domain/task-contracts";

/** Transação do Prisma. Todas as funções internas operam dentro de uma. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type TaskInput = {
  workspaceId: string;
  projectId?: string;
  boardColumnId?: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  assigneeIds?: string[];
  sprintId?: string;
  startDate?: string;
  dueDate?: string;
  estimateMinutes?: number;
  subtaskTitles?: string[];
  /** Nomes de etiqueta, como a interface trabalha. Resolvidos para id aqui. */
  labels?: string[];
};

export type TaskPatch = Partial<Omit<TaskInput, "workspaceId" | "projectId" | "boardColumnId">>;

function toDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

async function logActivity(
  tx: Tx,
  taskId: string,
  authorId: string,
  kind: ActivityKind,
  text: string,
) {
  await tx.activity.create({ data: { taskId, authorId, kind, text } });
}

/**
 * Traduz nomes de etiqueta para ids dentro do workspace. Nomes que não existem são
 * ignorados: a interface só oferece etiquetas do próprio workspace, então um nome
 * desconhecido significa dado obsoleto, não intenção de criar etiqueta nova.
 */
async function resolveLabelIds(tx: Tx, workspaceId: string, names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const labels = await tx.label.findMany({ where: { workspaceId, name: { in: names } } });
  return labels.map((label) => label.id);
}

async function replaceLabels(tx: Tx, taskId: string, workspaceId: string, names: string[]) {
  const labelIds = await resolveLabelIds(tx, workspaceId, names);
  await tx.taskLabel.deleteMany({ where: { taskId } });
  if (labelIds.length > 0) {
    await tx.taskLabel.createMany({ data: labelIds.map((labelId) => ({ taskId, labelId })) });
  }
}

async function assertTaskTargets(
  tx: Tx,
  workspaceId: string,
  projectId: string,
  targets: { assigneeId?: string; assigneeIds?: string[]; sprintId?: string },
) {
  const assigneeIds = [
    ...new Set(targets.assigneeIds ?? (targets.assigneeId ? [targets.assigneeId] : [])),
  ];
  if (assigneeIds.length) {
    // Ser membro do workspace não basta: quem não enxerga o projeto não veria a
    // tarefa atribuída em lugar nenhum, e ainda receberia notificação com o título.
    const count = await tx.workspaceMember.count({
      where: {
        workspaceId,
        userId: { in: assigneeIds },
        user: {
          OR: [
            { projectMemberships: { some: { projectId } } },
            { memberships: { some: { workspaceId, permission: { in: ["OWNER", "ADMIN"] } } } },
          ],
        },
      },
    });
    if (count !== assigneeIds.length) throw new NotFoundError();
  }
  if (targets.sprintId) {
    const sprint = await tx.sprint.findFirst({
      where: { id: targets.sprintId, workspaceId, projectId },
      select: { id: true },
    });
    if (!sprint) throw new NotFoundError();
  }
}

// Espelha o resolvedor de workspace-repository: nunca resolve para um projeto que o
// usuário não enxerga, e o palpite recai sobre o acessível mais antigo.
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
      boardColumns: {
        create: [
          { name: "A fazer", status: "todo", color: "#94a3b8", position: 0 },
          { name: "Em progresso", status: "in_progress", color: "#0086f2", position: 1 },
          { name: "Concluído", status: "done", color: "#22c55e", position: 2 },
        ],
      },
    },
  });
  return project.id;
}

async function resolveBoardColumn(
  tx: Tx,
  projectId: string,
  requestedId: string | undefined,
  status: TaskStatus,
) {
  const column = requestedId
    ? await tx.boardColumn.findFirst({ where: { id: requestedId, projectId } })
    : await tx.boardColumn.findFirst({
        where: { projectId, status },
        orderBy: { position: "asc" },
      });
  if (!column) throw new NotFoundError();
  return column;
}

/**
 * Aplica as automações do workspace depois de uma mudança de status.
 *
 * Espelha `applyAutomations` de `src/lib/store.ts`, que rodava no navegador. No
 * servidor ela roda dentro da mesma transação da mudança que a disparou: ou tudo
 * acontece, ou nada acontece.
 */
async function applyAutomations(
  tx: Tx,
  taskId: string,
  workspaceId: string,
  authorId: string,
  status: TaskStatus,
  previousStatus: TaskStatus,
) {
  if (status === previousStatus) return;

  const automations = await tx.automation.findMany({ where: { workspaceId, enabled: true } });

  for (const automation of automations) {
    const trigger = automation.trigger as { kind?: string; to?: TaskStatus };
    if (trigger.kind !== "status_changed" || trigger.to !== status) continue;

    const action = automation.action as {
      kind?: string;
      memberId?: string;
      priority?: TaskPriority;
      sprintId?: string;
      label?: string;
    };

    // Recarregado a cada volta: uma automação pode depender do efeito da anterior.
    const current = await tx.task.findUniqueOrThrow({ where: { id: taskId } });

    if (action.kind === "assign" && action.memberId && current.assigneeId !== action.memberId) {
      const membership = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: action.memberId } },
        include: { user: true },
      });
      const member = membership?.user;
      if (!member) continue;
      await tx.task.update({ where: { id: taskId }, data: { assigneeId: member.id } });
      await tx.taskAssignment.upsert({
        where: { taskId_userId: { taskId, userId: member.id } },
        update: {},
        create: { taskId, userId: member.id },
      });
      await logActivity(tx, taskId, authorId, "automation", `automação: atribuiu a ${member.name}`);
    } else if (
      action.kind === "set_priority" &&
      action.priority &&
      current.priority !== action.priority
    ) {
      await tx.task.update({ where: { id: taskId }, data: { priority: action.priority } });
      await logActivity(
        tx,
        taskId,
        authorId,
        "automation",
        `automação: prioridade → ${action.priority}`,
      );
    } else if (action.kind === "set_sprint") {
      const target = action.sprintId || null;
      if (target) {
        const sprint = await tx.sprint.findFirst({
          where: { id: target, workspaceId, projectId: current.projectId },
          select: { id: true },
        });
        if (!sprint) continue;
      }
      if (current.sprintId !== target) {
        await tx.task.update({ where: { id: taskId }, data: { sprintId: target } });
        await logActivity(
          tx,
          taskId,
          authorId,
          "automation",
          target ? "automação: adicionou ao sprint" : "automação: removeu do sprint",
        );
      }
    } else if (action.kind === "add_label" && action.label) {
      const [labelId] = await resolveLabelIds(tx, workspaceId, [action.label]);
      if (!labelId) continue;
      const existing = await tx.taskLabel.findUnique({
        where: { taskId_labelId: { taskId, labelId } },
      });
      if (existing) continue;
      await tx.taskLabel.create({ data: { taskId, labelId } });
      await logActivity(
        tx,
        taskId,
        authorId,
        "automation",
        `automação: adicionou etiqueta ${action.label}`,
      );
    }
  }
}

async function readTask(tx: Tx, id: string): Promise<Task> {
  const record = await tx.task.findUniqueOrThrow({
    where: { id },
    include: taskInclude,
  });
  return mapTask(record);
}

export async function createTask(input: TaskInput, authorId: string): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertWorkspaceMember(tx, authorId, input.workspaceId);
    const projectId = await resolveProjectId(tx, input.workspaceId, authorId, input.projectId);
    await assertProjectAccess(tx, authorId, projectId);
    await assertTaskTargets(tx, input.workspaceId, projectId, input);
    const assigneeIds = [
      ...new Set(input.assigneeIds ?? (input.assigneeId ? [input.assigneeId] : [])),
    ];
    const column = await resolveBoardColumn(
      tx,
      projectId,
      input.boardColumnId,
      input.status ?? "todo",
    );
    const last = await tx.task.findFirst({
      where: { boardColumnId: column.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const task = await tx.task.create({
      data: {
        workspaceId: input.workspaceId,
        projectId,
        boardColumnId: column.id,
        title: input.title,
        description: input.description ?? null,
        status: column.status,
        priority: input.priority ?? "medium",
        assigneeId: assigneeIds[0] ?? null,
        assignees: { create: assigneeIds.map((userId) => ({ userId })) },
        sprintId: input.sprintId ?? null,
        startDate: toDate(input.startDate) ?? null,
        dueDate: toDate(input.dueDate) ?? null,
        estimateMinutes: input.estimateMinutes ?? null,
        position: (last?.position ?? -1) + 1,
        subtasks: {
          create: (input.subtaskTitles ?? []).map((title, position) => ({ title, position })),
        },
      },
    });

    if (input.labels?.length) {
      await replaceLabels(tx, task.id, input.workspaceId, input.labels);
    }

    await logActivity(tx, task.id, authorId, "created", "criou a tarefa");
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorId: authorId,
      action: "task.created",
      entityType: "task",
      entityId: task.id,
      summary: `criou a tarefa “${task.title}”`,
      after: task,
    });

    return readTask(tx, task.id);
  });
}

export async function updateTask(id: string, patch: TaskPatch, authorId: string): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, authorId, id);
    const before = await tx.task.findUniqueOrThrow({ where: { id } });
    await assertTaskTargets(tx, before.workspaceId, before.projectId, patch);
    const statusColumn =
      patch.status !== undefined && patch.status !== before.status
        ? await resolveBoardColumn(tx, before.projectId, undefined, patch.status)
        : undefined;
    const hasAssignmentPatch = patch.assigneeIds !== undefined || patch.assigneeId !== undefined;
    const assigneeIds = hasAssignmentPatch
      ? [...new Set(patch.assigneeIds ?? (patch.assigneeId ? [patch.assigneeId] : []))]
      : undefined;

    await tx.task.update({
      where: { id },
      data: {
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.description !== undefined && { description: patch.description ?? null }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(statusColumn && { boardColumnId: statusColumn.id }),
        ...(patch.priority !== undefined && { priority: patch.priority }),
        ...(hasAssignmentPatch && {
          assigneeId: assigneeIds?.[0] ?? null,
          assignees: {
            deleteMany: {},
            create: (assigneeIds ?? []).map((userId) => ({ userId })),
          },
        }),
        ...(patch.sprintId !== undefined && { sprintId: patch.sprintId ?? null }),
        ...(patch.startDate !== undefined && { startDate: toDate(patch.startDate) ?? null }),
        ...(patch.dueDate !== undefined && { dueDate: toDate(patch.dueDate) ?? null }),
        ...(patch.estimateMinutes !== undefined && {
          estimateMinutes: patch.estimateMinutes ?? null,
        }),
      },
    });

    if (patch.labels !== undefined) {
      await replaceLabels(tx, id, before.workspaceId, patch.labels);
    }

    // Mesmas frases que o store gerava no navegador, para o histórico não mudar de
    // vocabulário no meio da migração.
    if (patch.status !== undefined && patch.status !== before.status) {
      await logActivity(
        tx,
        id,
        authorId,
        "status",
        `mudou status para "${statusLabels[patch.status]}"`,
      );
    }
    if (patch.priority !== undefined && patch.priority !== before.priority) {
      await logActivity(
        tx,
        id,
        authorId,
        "priority",
        `mudou prioridade para "${priorityLabels[patch.priority]}"`,
      );
    }
    if (hasAssignmentPatch) {
      const members = assigneeIds?.length
        ? await tx.user.findMany({ where: { id: { in: assigneeIds } }, select: { name: true } })
        : [];
      await logActivity(
        tx,
        id,
        authorId,
        "assignee",
        members.length
          ? `atribuiu a ${members.map((member) => member.name).join(", ")}`
          : "removeu os responsáveis",
      );
    }
    if (
      patch.dueDate !== undefined &&
      toDate(patch.dueDate)?.getTime() !== before.dueDate?.getTime()
    ) {
      await logActivity(
        tx,
        id,
        authorId,
        "dueDate",
        patch.dueDate ? "atualizou o prazo" : "removeu o prazo",
      );
    }
    if (patch.sprintId !== undefined && (patch.sprintId ?? null) !== before.sprintId) {
      await logActivity(
        tx,
        id,
        authorId,
        "sprint",
        patch.sprintId ? "adicionou ao sprint" : "removeu do sprint",
      );
    }

    if (patch.status !== undefined && patch.status !== before.status) {
      await applyAutomations(tx, id, before.workspaceId, authorId, patch.status, before.status);
    }

    const after = await tx.task.findUniqueOrThrow({ where: { id } });
    await recordAudit(tx, {
      workspaceId: before.workspaceId,
      actorId: authorId,
      action: "task.updated",
      entityType: "task",
      entityId: id,
      summary: `atualizou a tarefa “${after.title}”`,
      before,
      after,
    });

    return readTask(tx, id);
  });
}

async function moveTaskToTarget(
  id: string,
  status: TaskStatus,
  authorId: string,
  requestedPosition?: number,
  requestedColumnId?: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, authorId, id);
    const before = await tx.task.findUniqueOrThrow({ where: { id } });
    const targetColumn = await resolveBoardColumn(tx, before.projectId, requestedColumnId, status);
    const targetCount = await tx.task.count({
      where: { boardColumnId: targetColumn.id, id: { not: id } },
    });
    const position = Math.min(requestedPosition ?? targetCount, targetCount);
    const sameColumn = before.boardColumnId === targetColumn.id;
    if (sameColumn && before.position === position) return readTask(tx, id);

    if (sameColumn) {
      if (before.position < position) {
        await tx.task.updateMany({
          where: {
            boardColumnId: targetColumn.id,
            position: { gt: before.position, lte: position },
          },
          data: { position: { decrement: 1 } },
        });
      } else {
        await tx.task.updateMany({
          where: {
            boardColumnId: targetColumn.id,
            position: { gte: position, lt: before.position },
          },
          data: { position: { increment: 1 } },
        });
      }
    } else {
      await tx.task.updateMany({
        where: {
          boardColumnId: before.boardColumnId,
          position: { gt: before.position },
        },
        data: { position: { decrement: 1 } },
      });
      await tx.task.updateMany({
        where: { boardColumnId: targetColumn.id, position: { gte: position } },
        data: { position: { increment: 1 } },
      });
    }

    await tx.task.update({
      where: { id },
      data: { status: targetColumn.status, boardColumnId: targetColumn.id, position },
    });
    if (before.status !== status) {
      await logActivity(tx, id, authorId, "status", `moveu para "${statusLabels[status]}"`);
      await applyAutomations(tx, id, before.workspaceId, authorId, status, before.status);
    }

    const after = await tx.task.findUniqueOrThrow({ where: { id } });
    await recordAudit(tx, {
      workspaceId: before.workspaceId,
      actorId: authorId,
      action: "task.moved",
      entityType: "task",
      entityId: id,
      summary: `moveu “${after.title}” para ${targetColumn.name}`,
      before,
      after,
    });

    return readTask(tx, id);
  });
}

export async function moveTask(
  id: string,
  status: TaskStatus,
  authorId: string,
  requestedPosition?: number,
): Promise<Task> {
  return moveTaskToTarget(id, status, authorId, requestedPosition);
}

export async function moveTaskToColumn(
  id: string,
  boardColumnId: string,
  authorId: string,
  requestedPosition?: number,
): Promise<Task> {
  // A coluna precisa estar num projeto que o autor enxerga: antes esta leitura não
  // tinha checagem alguma, e devolvia o status de qualquer coluna a partir do id.
  const column = await prisma.boardColumn.findFirst({
    where: { id: boardColumnId, ...projectScoped(authorId) },
  });
  if (!column) throw new NotFoundError();
  return moveTaskToTarget(id, column.status, authorId, requestedPosition, boardColumnId);
}

export async function addComment(taskId: string, text: string, authorId: string): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, authorId, taskId);
    await tx.comment.create({ data: { taskId, authorId, text } });
    await logActivity(tx, taskId, authorId, "comment", "comentou");
    return readTask(tx, taskId);
  });
}

export async function deleteComment(
  taskId: string,
  commentId: string,
  userId?: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, userId, taskId);
    await tx.comment.delete({ where: { id: commentId, taskId } });
    return readTask(tx, taskId);
  });
}

export async function addSubtask(taskId: string, title: string, authorId: string): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, authorId, taskId);
    const last = await tx.subtask.findFirst({ where: { taskId }, orderBy: { position: "desc" } });
    await tx.subtask.create({ data: { taskId, title, position: (last?.position ?? -1) + 1 } });
    await logActivity(tx, taskId, authorId, "subtask", `adicionou subtarefa "${title}"`);
    return readTask(tx, taskId);
  });
}

export async function toggleSubtask(
  taskId: string,
  subtaskId: string,
  authorId: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, authorId, taskId);
    const subtask = await tx.subtask.findFirstOrThrow({ where: { id: subtaskId, taskId } });
    await tx.subtask.update({ where: { id: subtaskId }, data: { done: !subtask.done } });
    await logActivity(
      tx,
      taskId,
      authorId,
      "subtask",
      `${subtask.done ? "reabriu" : "concluiu"} "${subtask.title}"`,
    );
    return readTask(tx, taskId);
  });
}

export async function renameSubtask(
  taskId: string,
  subtaskId: string,
  title: string,
  userId?: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, userId, taskId);
    await tx.subtask.update({ where: { id: subtaskId, taskId }, data: { title } });
    return readTask(tx, taskId);
  });
}

export async function removeSubtask(
  taskId: string,
  subtaskId: string,
  userId?: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, userId, taskId);
    await tx.subtask.delete({ where: { id: subtaskId, taskId } });
    return readTask(tx, taskId);
  });
}

export async function addTimeEntry(
  taskId: string,
  minutes: number,
  note: string | undefined,
  authorId: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, authorId, taskId);
    await tx.timeEntry.create({ data: { taskId, authorId, minutes, note: note ?? null } });
    await logActivity(tx, taskId, authorId, "time", `registrou ${minutes} min`);
    return readTask(tx, taskId);
  });
}

export async function removeTimeEntry(
  taskId: string,
  entryId: string,
  userId?: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, userId, taskId);
    await tx.timeEntry.delete({ where: { id: entryId, taskId } });
    return readTask(tx, taskId);
  });
}

export async function setEstimate(
  taskId: string,
  minutes: number | undefined,
  userId?: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, userId, taskId);
    await tx.task.update({ where: { id: taskId }, data: { estimateMinutes: minutes ?? null } });
    return readTask(tx, taskId);
  });
}

export async function setFieldValue(
  taskId: string,
  fieldId: string,
  value: string | number | null,
  userId?: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, userId, taskId);
    const task = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
    const field = await tx.customField.findFirst({
      where: { id: fieldId, workspaceId: task.workspaceId },
      select: { id: true },
    });
    if (!field) throw new NotFoundError();
    if (value === null || value === "") {
      await tx.taskFieldValue.deleteMany({ where: { taskId, fieldId } });
    } else {
      await tx.taskFieldValue.upsert({
        where: { taskId_fieldId: { taskId, fieldId } },
        update: {
          valueText: typeof value === "string" ? value : null,
          valueNumber: typeof value === "number" ? value : null,
        },
        create: {
          taskId,
          fieldId,
          valueText: typeof value === "string" ? value : null,
          valueNumber: typeof value === "number" ? value : null,
        },
      });
    }
    return readTask(tx, taskId);
  });
}

export async function addBlocker(
  taskId: string,
  blockerId: string,
  authorId: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, authorId, taskId);
    await assertTaskMember(tx, authorId, blockerId);
    if (taskId === blockerId) throw new Error("Uma tarefa não pode bloquear a si mesma.");
    const [task, blocker] = await Promise.all([
      tx.task.findUniqueOrThrow({
        where: { id: taskId },
        select: { workspaceId: true, projectId: true },
      }),
      tx.task.findUniqueOrThrow({
        where: { id: blockerId },
        select: { workspaceId: true, projectId: true, title: true },
      }),
    ]);
    if (task.workspaceId !== blocker.workspaceId || task.projectId !== blocker.projectId) {
      throw new NotFoundError();
    }
    await tx.taskBlocker.create({ data: { taskId, blockedByTaskId: blockerId } });
    await logActivity(tx, taskId, authorId, "dependency", `bloqueado por "${blocker.title}"`);
    return readTask(tx, taskId);
  });
}

export async function removeBlocker(
  taskId: string,
  blockerId: string,
  userId?: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, userId, taskId);
    await assertTaskMember(tx, userId, blockerId);
    await tx.taskBlocker.delete({
      where: { taskId_blockedByTaskId: { taskId, blockedByTaskId: blockerId } },
    });
    return readTask(tx, taskId);
  });
}

/**
 * As linhas dependentes — comentários, subtarefas, bloqueios, fixados — somem por
 * cascata, declarada no schema. Não há limpeza manual a fazer aqui.
 */
export async function deleteTask(id: string, userId?: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, userId, id);
    const task = await tx.task.findUniqueOrThrow({ where: { id } });
    if (userId) {
      await recordAudit(tx, {
        workspaceId: task.workspaceId,
        actorId: userId,
        action: "task.deleted",
        entityType: "task",
        entityId: id,
        summary: `excluiu a tarefa “${task.title}”`,
        before: task,
      });
    }
    await tx.task.delete({ where: { id } });
    return task.workspaceId;
  });
}

export async function addAttachment(
  taskId: string,
  input: AttachmentInput,
  uploaderId: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, uploaderId, taskId);
    const task = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
    const data = Buffer.from(input.data, "base64");
    if (data.byteLength !== input.size || data.byteLength > 10 * 1024 * 1024) {
      throw new Error("Arquivo inválido ou maior que 10 MB.");
    }
    const attachmentId = randomUUID();
    const attachment = await tx.attachment.create({
      data: {
        id: attachmentId,
        taskId,
        uploaderId,
        name: input.name,
        mimeType: input.mimeType,
        size: data.byteLength,
        data: Uint8Array.from(
          encryptContentBuffer(data, attachmentContentAad(taskId, attachmentId)),
        ),
      },
    });
    await recordAudit(tx, {
      workspaceId: task.workspaceId,
      actorId: uploaderId,
      action: "attachment.created",
      entityType: "attachment",
      entityId: attachment.id,
      summary: `anexou “${attachment.name}” em “${task.title}”`,
    });
    return readTask(tx, taskId);
  });
}

export async function readAttachment(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const attachment = await tx.attachment.findUnique({
      where: { id },
      include: { task: { select: { id: true } } },
    });
    if (!attachment) throw new NotFoundError();
    await assertTaskReader(tx, userId, attachment.task.id);
    return {
      ...attachment,
      data: decryptContentBuffer(
        Buffer.from(attachment.data),
        attachmentContentAad(attachment.taskId, attachment.id),
      ),
    };
  });
}

export async function removeAttachment(
  taskId: string,
  attachmentId: string,
  userId: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskMember(tx, userId, taskId);
    const task = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
    const attachment = await tx.attachment.findFirst({ where: { id: attachmentId, taskId } });
    if (!attachment) throw new NotFoundError();
    await tx.attachment.delete({ where: { id: attachmentId } });
    await recordAudit(tx, {
      workspaceId: task.workspaceId,
      actorId: userId,
      action: "attachment.deleted",
      entityType: "attachment",
      entityId: attachment.id,
      summary: `removeu o anexo “${attachment.name}” de “${task.title}”`,
    });
    return readTask(tx, taskId);
  });
}
