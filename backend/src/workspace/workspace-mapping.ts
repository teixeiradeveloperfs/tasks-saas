import { accessibleProjectFilter, projectScoped } from "@/auth/authorization";
import { toIso } from "@/workspace/task-mapping";
import { decryptContentText, documentContentAad } from "@/security/content-encryption";
import type { BoardColumn, Workspace } from "@task-flow/shared/domain/models";

/**
 * Relações que um workspace precisa carregar para virar o tipo de domínio.
 *
 * Recebe quem está lendo porque tudo que pende de um projeto — projetos, sprints,
 * documentos, metas e runbooks — só aparece se o projeto for acessível a essa
 * pessoa. Como toda mutação de workspace devolve o workspace por aqui, filtrar
 * neste ponto fecha as leituras de uma vez, em vez de espalhar a checagem.
 *
 * Não inclui `tasks`: a leitura do board acrescenta isso por cima, mas uma mutação de
 * workspace não precisa arrastar todas as tarefas só para devolver o nome novo.
 */
export function workspaceIncludeFor(viewerUserId: string) {
  const project = { where: projectScoped(viewerUserId) };

  return {
    members: { include: { user: { include: { projectMemberships: true } } } },
    projects: {
      where: accessibleProjectFilter(viewerUserId),
      orderBy: { createdAt: "asc" as const },
      include: { boardColumns: { orderBy: { position: "asc" as const } } },
    },
    labels: { orderBy: { name: "asc" as const } },
    whiteboards: {
      // Metadados apenas: a cena pode ter centenas de KB e tem GET próprio.
      where: projectScoped(viewerUserId),
      select: { id: true, projectId: true, title: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: "desc" as const },
    },
    sprints: project,
    customFields: true,
    docs: project,
    goals: { ...project, include: { tasks: true, sprints: true } },
    automations: true,
    runbooks: {
      ...project,
      orderBy: { updatedAt: "desc" as const },
      include: {
        steps: { orderBy: { position: "asc" as const } },
        variables: { orderBy: { position: "asc" as const } },
        favorites: { select: { userId: true } },
      },
    },
  } as const;
}

/** Forma mínima que `mapWorkspace` sabe traduzir. */
type WorkspaceRecord = {
  id: string;
  name: string;
  color: string;
  description: string | null;
  imageUrl: string | null;
  createdAt: Date;
  members: Array<{
    userId: string;
    title: string | null;
    permission: Workspace["members"][number]["permission"];
    user: {
      name: string;
      avatarColor: string;
      avatarUrl: string | null;
      email: string;
      projectMemberships: Array<{ projectId: string }>;
    };
  }>;
  projects: Array<{
    id: string;
    workspaceId: string;
    name: string;
    description: string | null;
    color: string;
    createdAt: Date;
    boardColumns: Array<{
      id: string;
      projectId: string;
      name: string;
      status: BoardColumn["status"];
      color: string;
      position: number;
      createdAt: Date;
    }>;
  }>;
  labels: Array<{ id: string; name: string; color: string }>;
  sprints: Array<{
    id: string;
    projectId: string;
    name: string;
    goal: string | null;
    startDate: Date | null;
    endDate: Date | null;
    status: Workspace["sprints"][number]["status"];
    createdAt: Date;
  }>;
  customFields: Array<{
    id: string;
    name: string;
    type: Workspace["customFields"][number]["type"];
    options: string[];
  }>;
  docs: Array<{
    id: string;
    workspaceId: string;
    projectId: string;
    title: string;
    body: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  whiteboards: Array<{
    id: string;
    projectId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  goals: Array<{
    id: string;
    projectId: string;
    name: string;
    description: string | null;
    dueDate: Date | null;
    createdAt: Date;
    tasks: Array<{ taskId: string }>;
    sprints: Array<{ sprintId: string }>;
  }>;
  automations: Array<{
    id: string;
    name: string;
    enabled: boolean;
    trigger: unknown;
    action: unknown;
    createdAt: Date;
  }>;
  runbooks: Array<{
    id: string;
    workspaceId: string;
    projectId: string;
    title: string;
    description: string | null;
    category: string;
    environment: string;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
    steps: Array<{
      id: string;
      title: string;
      command: string;
      explanation: string | null;
      expectedResult: string | null;
      risk: "safe" | "caution" | "dangerous";
      position: number;
      checked: boolean;
    }>;
    variables: Array<{
      id: string;
      key: string;
      defaultValue: string | null;
      description: string | null;
      position: number;
    }>;
    favorites: Array<{ userId: string }>;
  }>;
};

export function mapWorkspace(record: WorkspaceRecord, viewerUserId?: string): Workspace {
  const viewer = record.members.find((item) => item.userId === viewerUserId);
  const canSeeMemberEmails = viewer?.permission === "OWNER" || viewer?.permission === "ADMIN";
  // Sai dos projetos já filtrados por acesso: quem administra vê todos e consegue
  // gerir a equipe; para os demais, as concessões alheias ficam recortadas ao que
  // eles próprios enxergam, em vez de revelar a existência de projetos ocultos.
  const visibleProjectIds = new Set(record.projects.map((project) => project.id));
  return {
    id: record.id,
    name: record.name,
    color: record.color,
    description: record.description ?? undefined,
    imageUrl: record.imageUrl ?? undefined,
    projects: record.projects.map((item) => ({
      id: item.id,
      workspaceId: item.workspaceId,
      name: item.name,
      description: item.description ?? undefined,
      color: item.color,
      boardColumns: item.boardColumns.map((column) => ({
        ...column,
        createdAt: column.createdAt.toISOString(),
      })),
      createdAt: item.createdAt.toISOString(),
    })),
    labels: record.labels.map((item) => ({
      id: item.id,
      name: item.name,
      color: item.color,
    })),
    // O id do membro é o id do usuário: é ele que `Task.assigneeId` referencia.
    members: record.members.map((item) => ({
      id: item.userId,
      name: item.user.name,
      color: item.user.avatarColor,
      avatarUrl: item.user.avatarUrl ?? undefined,
      // E-mail é dado de conta, não conteúdo compartilhado do workspace. A equipe
      // administrativa pode consultá-lo; os demais recebem apenas o próprio.
      email: canSeeMemberEmails || item.userId === viewerUserId ? item.user.email : undefined,
      role: item.title ?? undefined,
      permission: item.permission,
      // Só os projetos deste workspace: o usuário pode ter concessões em outros.
      projectIds: item.user.projectMemberships
        .filter((grant) => visibleProjectIds.has(grant.projectId))
        .map((grant) => grant.projectId),
    })),
    sprints: record.sprints.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      name: item.name,
      goal: item.goal ?? undefined,
      startDate: toIso(item.startDate),
      endDate: toIso(item.endDate),
      status: item.status,
      createdAt: item.createdAt.toISOString(),
    })),
    customFields: record.customFields.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      options: item.options,
    })),
    docs: record.docs.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      title: item.title,
      body: decryptContentText(item.body, documentContentAad(item.workspaceId, item.id)),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    whiteboards: record.whiteboards.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      title: item.title,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    goals: record.goals.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      name: item.name,
      description: item.description ?? undefined,
      dueDate: toIso(item.dueDate),
      taskIds: item.tasks.map(({ taskId }) => taskId),
      sprintIds: item.sprints.map(({ sprintId }) => sprintId),
      createdAt: item.createdAt.toISOString(),
    })),
    automations: record.automations.map((item) => ({
      id: item.id,
      name: item.name,
      enabled: item.enabled,
      trigger: item.trigger as Workspace["automations"][number]["trigger"],
      action: item.action as Workspace["automations"][number]["action"],
      createdAt: item.createdAt.toISOString(),
    })),
    runbooks: record.runbooks.map((item) => ({
      id: item.id,
      workspaceId: item.workspaceId,
      projectId: item.projectId,
      title: item.title,
      description: item.description ?? undefined,
      category: item.category,
      environment: item.environment,
      tags: item.tags,
      favorite: item.favorites.some((favorite) => favorite.userId === viewerUserId),
      steps: item.steps.map((step) => ({
        id: step.id,
        title: step.title,
        command: step.command,
        explanation: step.explanation ?? undefined,
        expectedResult: step.expectedResult ?? undefined,
        risk: step.risk,
        position: step.position,
        checked: step.checked,
      })),
      variables: item.variables.map((variable) => ({
        id: variable.id,
        key: variable.key,
        defaultValue: variable.defaultValue ?? undefined,
        description: variable.description ?? undefined,
        position: variable.position,
      })),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    createdAt: record.createdAt.toISOString(),
  };
}
