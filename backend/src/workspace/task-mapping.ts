import type { ActivityEntry, CustomFieldValue, Task } from "@task-flow/shared/domain/models";

/**
 * Tudo que uma linha de `Task` precisa carregar para virar o tipo de domínio que as
 * telas consomem. Fica num módulo próprio porque a leitura do board e as mutações
 * precisam exatamente da mesma forma — se as duas divergirem, a tela passa a mostrar
 * uma tarefa diferente conforme o caminho que a trouxe.
 */
export const taskInclude = {
  assignee: true,
  assignees: { include: { user: true }, orderBy: { createdAt: "asc" as const } },
  labels: { include: { label: true } },
  comments: { include: { author: true } },
  subtasks: { orderBy: { position: "asc" as const } },
  timeEntries: { include: { author: true } },
  fieldValues: true,
  activities: { include: { author: true } },
  blockedBy: true,
  attachments: {
    select: {
      id: true,
      name: true,
      mimeType: true,
      size: true,
      createdAt: true,
      uploader: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  pullRequests: { orderBy: { createdAt: "asc" as const } },
} as const;

export function toIso(value: Date | null | undefined): string | undefined {
  return value?.toISOString();
}

/** Forma mínima que `mapTask` sabe traduzir. */
type TaskRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  boardColumnId: string | null;
  title: string;
  description: string | null;
  status: Task["status"];
  priority: Task["priority"];
  assigneeId: string | null;
  sprintId: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  estimateMinutes: number | null;
  position: number;
  createdAt: Date;
  assignee: { name: string } | null;
  assignees: Array<{ userId: string; user: { name: string } }>;
  labels: Array<{ label: { name: string } }>;
  comments: Array<{ id: string; text: string; createdAt: Date; author: { name: string } }>;
  subtasks: Array<{ id: string; title: string; done: boolean }>;
  timeEntries: Array<{
    id: string;
    minutes: number;
    note: string | null;
    createdAt: Date;
    author: { name: string };
  }>;
  fieldValues: Array<{ fieldId: string; valueText: string | null; valueNumber: number | null }>;
  activities: Array<{
    id: string;
    kind: ActivityEntry["kind"];
    text: string;
    createdAt: Date;
    author: { name: string };
  }>;
  blockedBy: Array<{ blockedByTaskId: string }>;
  attachments: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    createdAt: Date;
    uploader: { name: string };
  }>;
  pullRequests: Array<{
    id: string;
    repositoryFullName: string;
    pullRequestNumber: number;
    title: string;
    url: string;
    state: string;
    draft: boolean;
    merged: boolean;
    headSha: string | null;
    ciStatus: string;
    ciConclusion: string | null;
    checkedAt: Date;
  }>;
};

export function mapTask(record: TaskRecord): Task {
  const customFields: Record<string, CustomFieldValue> = {};
  for (const value of record.fieldValues) {
    customFields[value.fieldId] = value.valueText ?? value.valueNumber ?? null;
  }

  const activity: ActivityEntry[] = record.activities.map((item) => ({
    id: item.id,
    kind: item.kind,
    text: item.text,
    author: item.author.name,
    createdAt: item.createdAt.toISOString(),
  }));
  const assignmentIds = record.assignees.map((item) => item.userId);
  const assigneeIds = record.assigneeId
    ? [record.assigneeId, ...assignmentIds.filter((id) => id !== record.assigneeId)]
    : assignmentIds;

  return {
    id: record.id,
    workspaceId: record.workspaceId,
    projectId: record.projectId,
    boardColumnId: record.boardColumnId ?? undefined,
    title: record.title,
    description: record.description ?? undefined,
    status: record.status,
    priority: record.priority,
    assignee: record.assignee?.name,
    assigneeId: record.assigneeId ?? undefined,
    assigneeIds,
    startDate: toIso(record.startDate),
    dueDate: toIso(record.dueDate),
    labels: record.labels.map(({ label }) => label.name),
    comments: record.comments.map((item) => ({
      id: item.id,
      author: item.author.name,
      text: item.text,
      createdAt: item.createdAt.toISOString(),
    })),
    subtasks: record.subtasks.map((item) => ({
      id: item.id,
      title: item.title,
      done: item.done,
    })),
    timeEntries: record.timeEntries.map((item) => ({
      id: item.id,
      minutes: item.minutes,
      note: item.note ?? undefined,
      author: item.author.name,
      createdAt: item.createdAt.toISOString(),
    })),
    estimateMinutes: record.estimateMinutes ?? undefined,
    sprintId: record.sprintId ?? undefined,
    customFields,
    activity,
    blockedBy: record.blockedBy.map((item) => item.blockedByTaskId),
    attachments: record.attachments.map((item) => ({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      uploader: item.uploader.name,
      createdAt: item.createdAt.toISOString(),
    })),
    pullRequests: record.pullRequests.map((item) => ({
      id: item.id,
      repositoryFullName: item.repositoryFullName,
      number: item.pullRequestNumber,
      title: item.title,
      url: item.url,
      state: item.state,
      draft: item.draft,
      merged: item.merged,
      headSha: item.headSha ?? undefined,
      ciStatus: item.ciStatus,
      ciConclusion: item.ciConclusion ?? undefined,
      checkedAt: item.checkedAt.toISOString(),
    })),
    position: record.position,
    createdAt: record.createdAt.toISOString(),
  };
}
