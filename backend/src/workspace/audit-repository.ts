import { prisma } from "@/db/client";
import {
  assertWorkspaceEditor,
  assertWorkspaceMember,
  NotFoundError,
  projectScoped,
} from "@/auth/authorization";
import type { AuditEvent } from "@task-flow/shared/domain/models";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type AuditInput = {
  workspaceId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  before?: unknown;
  after?: unknown;
};

const json = (value: unknown) =>
  value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as never);

export async function recordAudit(tx: Tx, input: AuditInput) {
  return tx.auditEvent.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      before: json(input.before),
      after: json(input.after),
    },
  });
}

function mapAudit(record: {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: Date;
  before: unknown;
  actor: { name: string };
}): AuditEvent {
  return {
    id: record.id,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId ?? undefined,
    summary: record.summary,
    actor: record.actor.name,
    createdAt: record.createdAt.toISOString(),
    undoable:
      record.entityType === "task" &&
      record.before !== null &&
      (record.action === "task.updated" || record.action === "task.moved"),
  };
}

/**
 * Entidades que vivem dentro de um projeto. Um evento sobre elas carrega no resumo
 * o título do que mudou, então precisa sumir para quem não enxerga aquele projeto.
 * As demais — etiqueta, campo, convite, membro, reunião, workspace — são do
 * workspace e ficam visíveis a qualquer membro.
 */
const PROJECT_SCOPED_ENTITIES = ["task", "attachment", "doc", "goal", "sprint", "runbook"] as const;

type ProjectScopedEntity = (typeof PROJECT_SCOPED_ENTITIES)[number];

/** Ids, entre os informados, cuja entidade está num projeto acessível ao usuário. */
async function visibleEntityIds(
  tx: Tx,
  userId: string,
  entityType: ProjectScopedEntity,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const scope = projectScoped(userId);
  const where = { id: { in: ids }, ...scope };
  const select = { id: true };

  // Um `switch` e não um mapa de delegates: reunir as tabelas num objeto produz uma
  // união de tipos que o Prisma não deixa chamar.
  const rows = await (async () => {
    switch (entityType) {
      case "task":
        return tx.task.findMany({ where, select });
      case "doc":
        return tx.doc.findMany({ where, select });
      case "goal":
        return tx.goal.findMany({ where, select });
      case "sprint":
        return tx.sprint.findMany({ where, select });
      case "runbook":
        return tx.runbook.findMany({ where, select });
      case "attachment":
        // O anexo não tem projeto próprio: herda o da tarefa dona.
        return tx.attachment.findMany({ where: { id: { in: ids }, task: scope }, select });
    }
  })();

  return new Set(rows.map((row) => row.id));
}

export async function listAuditEvents(
  workspaceId: string,
  userId: string,
  cursor?: string,
  limit = 30,
): Promise<{ items: AuditEvent[]; nextCursor?: string }> {
  return prisma.$transaction(async (tx) => {
    await assertWorkspaceMember(tx, userId, workspaceId);
    const records = await tx.auditEvent.findMany({
      where: { workspaceId },
      include: { actor: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(limit, 100) + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    const hasMore = records.length > Math.min(limit, 100);
    const page = records.slice(0, Math.min(limit, 100));

    // O filtro é feito sobre a página já carregada, e não no `where`: o evento
    // aponta para a entidade por id genérico, sem projeto próprio. Como a página é
    // pequena, sai em uma consulta por tipo — e o cursor segue avançando igual,
    // ainda que a página devolva menos itens do que o limite.
    const scoped = page.filter((record) =>
      (PROJECT_SCOPED_ENTITIES as readonly string[]).includes(record.entityType),
    );
    const visible = new Map<string, Set<string>>();
    await Promise.all(
      PROJECT_SCOPED_ENTITIES.map(async (entityType) => {
        const ids = scoped
          .filter((record) => record.entityType === entityType && record.entityId)
          .map((record) => record.entityId as string);
        visible.set(entityType, await visibleEntityIds(tx, userId, entityType, [...new Set(ids)]));
      }),
    );

    const items = page.filter((record) => {
      if (!(PROJECT_SCOPED_ENTITIES as readonly string[]).includes(record.entityType)) return true;
      if (!record.entityId) return true;
      return visible.get(record.entityType)?.has(record.entityId) ?? false;
    });

    return {
      items: items.map(mapAudit),
      nextCursor: hasMore ? page.at(-1)?.id : undefined,
    };
  });
}

export async function undoAuditEvent(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.auditEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundError();
    await assertWorkspaceEditor(tx, userId, event.workspaceId);
    if (
      event.entityType !== "task" ||
      !event.entityId ||
      !event.before ||
      (event.action !== "task.updated" && event.action !== "task.moved")
    ) {
      throw new NotFoundError();
    }
    const before = event.before as Record<string, unknown>;
    const current = await tx.task.findFirst({
      where: { id: event.entityId, workspaceId: event.workspaceId, ...projectScoped(userId) },
    });
    if (!current) throw new NotFoundError();
    const restored = await tx.task.update({
      where: { id: current.id },
      data: {
        title: String(before.title ?? current.title),
        description:
          before.description === null
            ? null
            : String(before.description ?? current.description ?? ""),
        status: (before.status as typeof current.status) ?? current.status,
        priority: (before.priority as typeof current.priority) ?? current.priority,
        assigneeId:
          before.assigneeId === null
            ? null
            : String(before.assigneeId ?? current.assigneeId ?? "") || null,
        sprintId:
          before.sprintId === null
            ? null
            : String(before.sprintId ?? current.sprintId ?? "") || null,
        startDate:
          before.startDate === null
            ? null
            : before.startDate
              ? new Date(String(before.startDate))
              : current.startDate,
        dueDate:
          before.dueDate === null
            ? null
            : before.dueDate
              ? new Date(String(before.dueDate))
              : current.dueDate,
        estimateMinutes:
          before.estimateMinutes === null
            ? null
            : Number(before.estimateMinutes ?? current.estimateMinutes),
        position: Number(before.position ?? current.position),
      },
    });
    await recordAudit(tx, {
      workspaceId: event.workspaceId,
      actorId: userId,
      action: "task.undo",
      entityType: "task",
      entityId: current.id,
      summary: `desfez: ${event.summary}`,
      before: current,
      after: restored,
    });
    return restored;
  });
}
