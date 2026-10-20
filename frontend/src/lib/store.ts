import { create } from "zustand";
import { toast } from "sonner";
import * as taskApi from "@/lib/api/task";
import * as workspaceApi from "@/lib/api/workspace";
import * as profileApi from "@/lib/api/profile";
import { getWorkspaceTasksPage } from "@/lib/api/board";
import type {
  ActivityKind,
  BoardData,
  Automation,
  BoardColumn,
  AutomationAction,
  AutomationTrigger,
  CustomField,
  CustomFieldValue,
  Doc,
  Whiteboard,
  Goal,
  Member,
  Profile,
  Project,
  Runbook,
  Sprint,
  Task,
  TaskPriority,
  TaskStatus,
  Workspace,
  WorkspaceIntegration,
  WorkspaceLabel,
} from "@task-flow/shared/domain/models";
import type { RunbookInput, RunbookPatch } from "@task-flow/shared/domain/workspace-contracts";

export type * from "@task-flow/shared/domain/models";

interface Store {
  workspaces: Workspace[];
  tasks: Task[];
  profile: Profile | null;
  integrations: Record<string, WorkspaceIntegration[]>;
  taskPageInfo: Record<string, { hasMore: boolean; nextCursor?: string }>;
  activeProjectIds: Record<string, string>;
  selectProject: (workspaceId: string, projectId: string) => void;
  hydrateFromServer: (data: BoardData, startedAtRevision?: number) => void;
  loadMoreWorkspaceTasks: (workspaceId: string) => Promise<void>;

  createWorkspace: (
    data: Omit<
      Workspace,
      | "id"
      | "createdAt"
      | "labels"
      | "members"
      | "sprints"
      | "customFields"
      | "docs"
      | "whiteboards"
      | "goals"
      | "automations"
      | "runbooks"
    > &
      Partial<
        Pick<
          Workspace,
          | "labels"
          | "members"
          | "sprints"
          | "customFields"
          | "docs"
          | "whiteboards"
          | "goals"
          | "automations"
          | "runbooks"
        >
      >,
  ) => Promise<Workspace>;
  updateWorkspace: (
    id: string,
    data: Partial<Omit<Workspace, "imageUrl">> & { imageUrl?: string | null },
  ) => Promise<Workspace>;
  deleteWorkspace: (id: string) => void;
  createProject: (
    workspaceId: string,
    data: Pick<Project, "name" | "color" | "description">,
  ) => Promise<Project | null>;
  updateProject: (
    workspaceId: string,
    projectId: string,
    data: Partial<Pick<Project, "name" | "color" | "description">>,
  ) => Promise<Project | null>;
  createBoardColumn: (
    projectId: string,
    data: Pick<BoardColumn, "name" | "status" | "color">,
  ) => Promise<BoardColumn | null>;
  createRunbook: (workspaceId: string, data: RunbookInput) => Promise<Runbook | null>;
  updateRunbook: (id: string, data: RunbookPatch) => Promise<Runbook | null>;
  deleteRunbook: (id: string) => Promise<boolean>;
  toggleRunbookFavorite: (id: string) => Promise<void>;
  toggleRunbookStep: (id: string) => Promise<void>;

  createLabel: (workspaceId: string, name: string, color: string) => Promise<WorkspaceLabel | null>;
  renameLabel: (workspaceId: string, labelId: string, name: string) => void;
  updateLabelColor: (workspaceId: string, labelId: string, color: string) => void;
  deleteLabel: (workspaceId: string, labelId: string) => void;

  updateMember: (
    workspaceId: string,
    memberId: string,
    data: Partial<Pick<Member, "role" | "permission" | "projectIds">>,
  ) => void;
  removeMember: (workspaceId: string, memberId: string) => void;

  createSprint: (
    workspaceId: string,
    data: Omit<Sprint, "id" | "createdAt" | "status"> & Partial<Pick<Sprint, "status">>,
  ) => Promise<Sprint | null>;
  updateSprint: (workspaceId: string, sprintId: string, data: Partial<Sprint>) => void;
  deleteSprint: (workspaceId: string, sprintId: string) => void;

  createCustomField: (
    workspaceId: string,
    data: Omit<CustomField, "id">,
  ) => Promise<CustomField | null>;
  updateCustomField: (workspaceId: string, fieldId: string, data: Partial<CustomField>) => void;
  deleteCustomField: (workspaceId: string, fieldId: string) => void;

  createDoc: (workspaceId: string, title: string) => Promise<Doc | null>;
  updateDoc: (
    workspaceId: string,
    docId: string,
    data: Partial<Pick<Doc, "title" | "body">>,
  ) => void;
  deleteDoc: (workspaceId: string, docId: string) => void;

  createWhiteboard: (workspaceId: string, title: string) => Promise<Whiteboard | null>;
  renameWhiteboard: (workspaceId: string, whiteboardId: string, title: string) => void;
  deleteWhiteboard: (workspaceId: string, whiteboardId: string) => void;

  createGoal: (
    workspaceId: string,
    data: Omit<Goal, "id" | "createdAt" | "taskIds" | "sprintIds"> &
      Partial<Pick<Goal, "taskIds" | "sprintIds">>,
  ) => Promise<Goal | null>;
  updateGoal: (workspaceId: string, goalId: string, data: Partial<Goal>) => void;
  deleteGoal: (workspaceId: string, goalId: string) => void;
  toggleGoalTask: (workspaceId: string, goalId: string, taskId: string) => void;
  toggleGoalSprint: (workspaceId: string, goalId: string, sprintId: string) => void;

  createAutomation: (
    workspaceId: string,
    data: Omit<Automation, "id" | "createdAt" | "enabled"> & Partial<Pick<Automation, "enabled">>,
  ) => Automation | null;
  updateAutomation: (workspaceId: string, id: string, data: Partial<Automation>) => void;
  deleteAutomation: (workspaceId: string, id: string) => void;

  createTask: (
    data: Omit<
      Task,
      | "id"
      | "createdAt"
      | "labels"
      | "comments"
      | "subtasks"
      | "timeEntries"
      | "customFields"
      | "activity"
      | "blockedBy"
      | "attachments"
      | "pullRequests"
      | "position"
    > &
      Partial<
        Pick<
          Task,
          | "labels"
          | "comments"
          | "subtasks"
          | "timeEntries"
          | "customFields"
          | "activity"
          | "blockedBy"
        >
      > & { subtaskTitles?: string[] },
  ) => Task;
  updateTask: (id: string, data: Partial<Task>) => void;
  deleteTask: (id: string) => Promise<boolean>;
  moveTask: (id: string, status: TaskStatus, position?: number) => void;
  moveTaskToColumn: (id: string, boardColumnId: string, position?: number) => void;

  addBlocker: (taskId: string, blockerId: string) => void;
  removeBlocker: (taskId: string, blockerId: string) => void;
  addAttachment: (
    taskId: string,
    input: { name: string; mimeType: string; size: number; data: string },
  ) => Promise<void>;
  removeAttachment: (taskId: string, attachmentId: string) => void;
  linkPullRequest: (taskId: string, url: string) => Promise<void>;
  refreshPullRequest: (taskId: string, linkId: string) => Promise<void>;
  removePullRequest: (taskId: string, linkId: string) => Promise<void>;

  addComment: (taskId: string, author: string, text: string) => void;
  deleteComment: (taskId: string, commentId: string) => void;

  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  renameSubtask: (taskId: string, subtaskId: string, title: string) => void;
  removeSubtask: (taskId: string, subtaskId: string) => void;

  addTimeEntry: (taskId: string, minutes: number, note: string | undefined, author: string) => void;
  removeTimeEntry: (taskId: string, entryId: string) => void;
  setEstimate: (taskId: string, minutes: number | undefined) => void;

  setFieldValue: (taskId: string, fieldId: string, value: CustomFieldValue) => void;

  updateProfile: (
    data: Partial<Omit<Profile, "avatarUrl">> & { avatarUrl?: string | null },
  ) => Promise<Profile>;
  togglePinWorkspace: (workspaceId: string) => void;
  togglePinTask: (taskId: string) => void;
  markNotificationsRead: () => void;

  toggleIntegration: (
    workspaceId: string,
    data: { id: string; name: string; category: string; config?: Record<string, string> },
  ) => void;
  updateIntegrationConfig: (
    workspaceId: string,
    integrationId: string,
    config: Record<string, string>,
  ) => void;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/* Dados-semente legados mantidos temporariamente apenas como referência histórica.
const seedWorkspaces: Workspace[] = [
  {
    id: "seed-acme",
    name: "Acme Inc.",
    color: "#0086f2",
    description: "Cliente principal — produto B2B",
    labels: [
      { id: "lbl-acme-1", name: "jurídico", color: "#8b5cf6" },
      { id: "lbl-acme-2", name: "urgente", color: "#ef4444" },
      { id: "lbl-acme-3", name: "design", color: "#ec4899" },
      { id: "lbl-acme-4", name: "produto", color: "#10b981" },
    ],
    members: seedMembersAcme,
    sprints: [
      {
        id: "spr-acme-1",
        name: "Sprint 12",
        goal: "Fechar release v1.2 e alinhar contrato",
        startDate: undefined,
        endDate: undefined,
        status: "active",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ],
    customFields: [
      { id: "cf-acme-1", name: "Story points", type: "number" },
      { id: "cf-acme-2", name: "Área", type: "select", options: ["Produto", "Design", "Jurídico"] },
    ],
    docs: [
      {
        id: "doc-acme-1",
        title: "Onboarding Acme",
        body: "# Contexto\n\nCliente B2B, contrato anual.\n\n## Contatos\n- Ana (Design)\n- Bruno (Dev)\n\n## Links\n- Repositório interno",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
    ],
    goals: [
      {
        id: "goal-acme-1",
        name: "Release v1.2 pronta",
        description: "Fechar todas as tarefas do Sprint 12 e publicar release.",
        taskIds: [],
        sprintIds: ["spr-acme-1"],
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ],
    automations: [
      {
        id: "auto-acme-1",
        name: "Ao concluir, remover do sprint",
        enabled: false,
        trigger: { kind: "status_changed", to: "done" },
        action: { kind: "set_sprint", sprintId: "" },
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ],
    createdAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "seed-personal",
    name: "Projetos pessoais",
    color: "#0ea5e9",
    description: "Ideias e side-projects",
    labels: [{ id: "lbl-personal-1", name: "escrita", color: "#f59e0b" }],
    members: seedMembersPersonal,
    sprints: [],
    customFields: [],
    docs: [],
    goals: [],
    automations: [],
    createdAt: "2025-01-01T00:00:00.000Z",
  },
];

const SEED_ANCHOR = new Date("2025-07-11T12:00:00.000Z");
const inSeedDays = (n: number) => {
  const d = new Date(SEED_ANCHOR);
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

const seedTasks: Task[] = [
  {
    id: "seed-task-1",
    workspaceId: "seed-acme",
    title: "Revisar proposta de contrato",
    description: "Alinhar cláusulas com o jurídico antes de sexta.",
    status: "todo",
    priority: "high",
    assignee: "Você",
    assigneeId: "mem-me",
    startDate: inSeedDays(0),
    dueDate: inSeedDays(2),
    labels: ["jurídico", "urgente"],
    comments: [
      {
        id: "seed-c-1",
        author: "Ana",
        text: "Enviei a última versão por email.",
        createdAt: "2025-07-10T12:00:00.000Z",
      },
    ],
    subtasks: [
      { id: "seed-s-1", title: "Ler v3", done: true },
      { id: "seed-s-2", title: "Marcar reunião", done: false },
    ],
    timeEntries: [
      {
        id: "seed-te-1",
        minutes: 45,
        note: "Leitura inicial",
        author: "Você",
        createdAt: "2025-07-10T14:00:00.000Z",
      },
    ],
    estimateMinutes: 180,
    sprintId: "spr-acme-1",
    customFields: { "cf-acme-1": 5, "cf-acme-2": "Jurídico" },
    activity: [
      {
        id: "seed-a-1",
        kind: "created",
        text: "criou a tarefa",
        author: "Você",
        createdAt: "2025-07-09T09:00:00.000Z",
      },
    ],
    blockedBy: [],
    createdAt: "2025-07-09T09:00:00.000Z",
  },
  {
    id: "seed-task-2",
    workspaceId: "seed-acme",
    title: "Kickoff com time de design",
    status: "in_progress",
    priority: "medium",
    assignee: "Ana Souza",
    assigneeId: "mem-ana",
    startDate: inSeedDays(-1),
    dueDate: inSeedDays(0),
    labels: ["design"],
    comments: [],
    subtasks: [],
    timeEntries: [],
    sprintId: "spr-acme-1",
    customFields: { "cf-acme-2": "Design" },
    activity: [
      {
        id: "seed-a-2",
        kind: "created",
        text: "criou a tarefa",
        author: "Você",
        createdAt: "2025-07-08T09:00:00.000Z",
      },
    ],
    blockedBy: ["seed-task-1"],
    createdAt: "2025-07-08T09:00:00.000Z",
  },
  {
    id: "seed-task-3",
    workspaceId: "seed-acme",
    title: "Publicar release notes v1.2",
    status: "done",
    priority: "low",
    assignee: "Bruno Lima",
    assigneeId: "mem-bruno",
    dueDate: inSeedDays(-3),
    labels: ["produto"],
    comments: [],
    subtasks: [],
    timeEntries: [
      { id: "seed-te-2", minutes: 60, author: "Bruno Lima", createdAt: "2025-07-07T15:00:00.000Z" },
    ],
    sprintId: "spr-acme-1",
    customFields: {},
    activity: [],
    blockedBy: [],
    createdAt: "2025-07-07T09:00:00.000Z",
  },
  {
    id: "seed-task-4",
    workspaceId: "seed-personal",
    title: "Rascunhar post sobre kanban",
    status: "todo",
    priority: "low",
    assignee: "Você",
    assigneeId: "mem-me",
    dueDate: inSeedDays(5),
    labels: ["escrita"],
    comments: [],
    subtasks: [],
    timeEntries: [],
    customFields: {},
    activity: [],
    blockedBy: [],
    createdAt: "2025-07-06T09:00:00.000Z",
  },
];

const pickColor = (i: number) => LABEL_COLORS[i % LABEL_COLORS.length];

const defaultProfile: Profile = {
  name: "Você",
  email: "voce@flow.app",
  role: "Product Manager",
  avatarColor: "#0086f2",
  bio: "Gerenciando tarefas em múltiplos workspaces.",
  pinnedWorkspaces: ["seed-acme"],
  pinnedTasks: [],
  notificationsReadAt: undefined,
};

*/
const withActivity = (task: Task, kind: ActivityKind, text: string, author: string): Task => ({
  ...task,
  activity: [
    ...task.activity,
    { id: uid(), kind, text, author, createdAt: new Date().toISOString() },
  ],
});

// Apply matching workspace automations to a task after a status change.
function applyAutomations(
  task: Task,
  workspace: Workspace | undefined,
  prevStatus: TaskStatus,
  author: string,
): Task {
  if (!workspace) return task;
  let next = task;
  for (const auto of workspace.automations) {
    if (!auto.enabled) continue;
    if (auto.trigger.kind !== "status_changed") continue;
    if (auto.trigger.to !== task.status || prevStatus === task.status) continue;
    const a = auto.action;
    if (a.kind === "assign") {
      const mem = workspace.members.find((m) => m.id === a.memberId);
      if (mem && next.assigneeId !== mem.id) {
        next = {
          ...next,
          assigneeId: next.assigneeId ?? mem.id,
          assignee: next.assignee ?? mem.name,
          assigneeIds: [...new Set([...(next.assigneeIds ?? []), mem.id])],
        };
        next = withActivity(next, "automation", `automação: atribuiu a ${mem.name}`, author);
      }
    } else if (a.kind === "set_priority") {
      if (next.priority !== a.priority) {
        next = { ...next, priority: a.priority };
        next = withActivity(next, "automation", `automação: prioridade → ${a.priority}`, author);
      }
    } else if (a.kind === "set_sprint") {
      const target = a.sprintId || undefined;
      if (next.sprintId !== target) {
        next = { ...next, sprintId: target };
        next = withActivity(
          next,
          "automation",
          target ? "automação: adicionou ao sprint" : "automação: removeu do sprint",
          author,
        );
      }
    } else if (a.kind === "add_label") {
      if (a.label && !next.labels.includes(a.label)) {
        next = { ...next, labels: [...next.labels, a.label] };
        next = withActivity(next, "automation", `automação: adicionou etiqueta ${a.label}`, author);
      }
    }
  }
  return next;
}

/**
 * Grava no servidor uma mudança que já foi aplicada na tela.
 *
 * A tela responde na hora — arrastar um cartão não pode esperar a rede — mas o banco
 * é a fonte da verdade. Quando a gravação falha, o estado anterior volta e um aviso
 * aparece; sem isso a interface mostraria uma alteração que o banco nunca recebeu, e
 * ela sumiria sozinha no próximo carregamento.
 */
type Snapshot = {
  workspaces: Workspace[];
  tasks: Task[];
  profile: Profile | null;
  integrations: Record<string, WorkspaceIntegration[]>;
  taskPageInfo: Record<string, { hasMore: boolean; nextCursor?: string }>;
};

let dataRevision = 0;
let pendingWrites = 0;

export const getDataRevision = () => dataRevision;

const snapshotOf = (s: Snapshot): Snapshot => ({
  workspaces: s.workspaces,
  tasks: s.tasks,
  profile: s.profile,
  integrations: s.integrations,
  taskPageInfo: s.taskPageInfo,
});

function requireProfile(profile: Profile | null): Profile {
  if (!profile) throw new Error("O perfil ainda não foi carregado pelo servidor.");
  return profile;
}

function writeThrough<T>(
  snapshot: Snapshot,
  operation: () => Promise<T>,
  reconcile: (result: T) => void,
  failureMessage: string,
) {
  dataRevision += 1;
  pendingWrites += 1;
  void operation()
    .then((result) => {
      dataRevision += 1;
      pendingWrites -= 1;
      reconcile(result);
    })
    .catch((error: unknown) => {
      dataRevision += 1;
      pendingWrites -= 1;
      console.error(error);
      useStore.setState(snapshot);
      toast.error(failureMessage);
    });
}

/** Troca um workspace pela versão que o servidor devolveu. */
const replaceWorkspace = (saved: Workspace) =>
  useStore.setState((s) => ({
    workspaces: s.workspaces.map((w) => (w.id === saved.id ? saved : w)),
  }));

const replaceTask = (saved: Task) =>
  useStore.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === saved.id ? saved : t)) }));

if (typeof window !== "undefined") {
  window.localStorage.removeItem("flow-tasks-store");
}

const ACTIVE_PROJECTS_KEY = "automa-active-projects";
function readActiveProjects(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(ACTIVE_PROJECTS_KEY) ?? "{}") as unknown;
    return value && typeof value === "object" ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function activeProjectIdFor(
  workspace: Workspace | undefined,
  activeProjectIds: Record<string, string>,
): string | undefined {
  if (!workspace) return undefined;
  const projects = workspace.projects ?? [];
  const selected = activeProjectIds[workspace.id];
  return projects.some((project) => project.id === selected) ? selected : projects[0]?.id;
}

export const useStore = create<Store>()((set, get) => ({
  // O banco é a fonte da verdade. O loader de _authed hidrata este estado antes
  // de renderizar as telas protegidas; não exibimos dados-semente como fallback.
  workspaces: [],
  tasks: [],
  profile: null,
  integrations: {},
  taskPageInfo: {},
  activeProjectIds: readActiveProjects(),
  selectProject: (workspaceId, projectId) => {
    set((state) => {
      const activeProjectIds = { ...state.activeProjectIds, [workspaceId]: projectId };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ACTIVE_PROJECTS_KEY, JSON.stringify(activeProjectIds));
      }
      return { activeProjectIds };
    });
  },
  hydrateFromServer: (data, startedAtRevision = dataRevision) => {
    if (startedAtRevision !== dataRevision || pendingWrites > 0) return;
    set({
      workspaces: data.workspaces,
      tasks: data.tasks,
      profile: data.profile,
      integrations: data.integrations,
      taskPageInfo: data.taskPageInfo,
    });
  },
  loadMoreWorkspaceTasks: async (workspaceId) => {
    const pageInfo = get().taskPageInfo[workspaceId];
    if (!pageInfo?.hasMore) return;
    const page = await getWorkspaceTasksPage(workspaceId, pageInfo.nextCursor);
    set((state) => {
      const existingIds = new Set(state.tasks.map((task) => task.id));
      return {
        tasks: [...state.tasks, ...page.items.filter((task) => !existingIds.has(task.id))],
        taskPageInfo: {
          ...state.taskPageInfo,
          [workspaceId]: { hasMore: page.hasMore, nextCursor: page.nextCursor },
        },
      };
    });
  },

  createProject: async (workspaceId, data) => {
    try {
      const saved = await workspaceApi.createProject({ data: { workspaceId, ...data } });
      replaceWorkspace(saved.workspace);
      get().selectProject(workspaceId, saved.project.id);
      return saved.project;
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível criar o projeto.");
      return null;
    }
  },
  updateProject: async (workspaceId, projectId, data) => {
    try {
      const saved = await workspaceApi.updateProject({ data: { id: projectId, patch: data } });
      replaceWorkspace(saved.workspace);
      return saved.project;
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível salvar o projeto.");
      return null;
    }
  },
  createBoardColumn: async (projectId, data) => {
    try {
      const saved = await workspaceApi.createBoardColumn({ data: { projectId, ...data } });
      replaceWorkspace(saved.workspace);
      return saved.column;
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível criar a coluna.");
      return null;
    }
  },
  createRunbook: async (workspaceId, data) => {
    try {
      const workspace = get().workspaces.find((item) => item.id === workspaceId);
      const saved = await workspaceApi.createRunbook({
        data: {
          workspaceId,
          ...data,
          projectId: data.projectId ?? activeProjectIdFor(workspace, get().activeProjectIds),
        },
      });
      replaceWorkspace(saved.workspace);
      return saved.runbook;
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível criar o runbook.");
      return null;
    }
  },
  updateRunbook: async (id, data) => {
    try {
      const saved = await workspaceApi.updateRunbook({ data: { id, patch: data } });
      replaceWorkspace(saved.workspace);
      return saved.runbook;
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível salvar o runbook.");
      return null;
    }
  },
  deleteRunbook: async (id) => {
    try {
      const saved = await workspaceApi.deleteRunbook({ data: { id } });
      replaceWorkspace(saved.workspace);
      return true;
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível excluir o runbook.");
      return false;
    }
  },
  toggleRunbookFavorite: async (id) => {
    try {
      const saved = await workspaceApi.toggleRunbookFavorite({ data: { id } });
      replaceWorkspace(saved.workspace);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível atualizar o favorito.");
    }
  },
  toggleRunbookStep: async (id) => {
    try {
      const saved = await workspaceApi.toggleRunbookStep({ data: { id } });
      replaceWorkspace(saved.workspace);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível atualizar a etapa.");
    }
  },

  toggleIntegration: (workspaceId, data) => {
    const snapshot = snapshotOf(get());
    set((s) => {
      const list = s.integrations[workspaceId] ?? [];
      const exists = list.some((i) => i.id === data.id);
      const next = exists
        ? list.filter((i) => i.id !== data.id)
        : [
            ...list,
            {
              id: data.id,
              name: data.name,
              category: data.category,
              config: data.config ?? {},
              connectedAt: new Date().toISOString(),
            },
          ];
      return { integrations: { ...s.integrations, [workspaceId]: next } };
    });
    writeThrough(
      snapshot,
      () => profileApi.toggleIntegration({ data: { workspaceId, ...data } }),
      (saved) => set((s) => ({ integrations: { ...s.integrations, [workspaceId]: saved } })),
      "Não foi possível atualizar a integração.",
    );
  },
  updateIntegrationConfig: (workspaceId, integrationId, config) => {
    const snapshot = snapshotOf(get());
    set((s) => {
      const list = s.integrations[workspaceId] ?? [];
      return {
        integrations: {
          ...s.integrations,
          [workspaceId]: list.map((i) => (i.id === integrationId ? { ...i, config } : i)),
        },
      };
    });
    writeThrough(
      snapshot,
      () =>
        profileApi.updateIntegrationConfig({
          data: { workspaceId, integrationId, config },
        }),
      (saved) => set((s) => ({ integrations: { ...s.integrations, [workspaceId]: saved } })),
      "Não foi possível salvar a integração.",
    );
  },

  createWorkspace: async (data) => {
    // A rota usa o id do workspace imediatamente após a criação. Por isso esta é
    // deliberadamente server-first: navegar com um UUID provisório deixava a tela em
    // "workspace não encontrado" assim que a resposta real substituía o objeto local.
    dataRevision += 1;
    pendingWrites += 1;
    try {
      const saved = await workspaceApi.createWorkspace({
        data: {
          name: data.name,
          color: data.color,
          description: data.description,
          imageUrl: data.imageUrl,
        },
      });
      dataRevision += 1;
      set((s) => ({
        workspaces: s.workspaces.some((workspace) => workspace.id === saved.id)
          ? s.workspaces
          : [...s.workspaces, saved],
      }));
      return saved;
    } catch (error) {
      dataRevision += 1;
      console.error(error);
      toast.error("Não foi possível criar o workspace.");
      throw error;
    } finally {
      pendingWrites -= 1;
    }
  },
  updateWorkspace: async (id, data) => {
    dataRevision += 1;
    pendingWrites += 1;
    try {
      const saved = await workspaceApi.updateWorkspace({
        data: {
          id,
          patch: {
            name: data.name,
            color: data.color,
            description: data.description,
            imageUrl: data.imageUrl,
          },
        },
      });
      dataRevision += 1;
      replaceWorkspace(saved);
      return saved;
    } catch (error) {
      dataRevision += 1;
      console.error(error);
      toast.error("Não foi possível salvar o workspace.");
      throw error;
    } finally {
      pendingWrites -= 1;
    }
  },
  deleteWorkspace: (id) => {
    const snapshot = snapshotOf(get());
    set((s) => {
      const profile = requireProfile(s.profile);
      return {
        workspaces: s.workspaces.filter((w) => w.id !== id),
        tasks: s.tasks.filter((t) => t.workspaceId !== id),
        profile: {
          ...profile,
          pinnedWorkspaces: profile.pinnedWorkspaces.filter((x) => x !== id),
        },
      };
    });

    writeThrough(
      snapshot,
      () => workspaceApi.deleteWorkspace({ data: { id } }),
      () => undefined,
      "Não foi possível excluir o workspace.",
    );
  },

  createLabel: async (workspaceId, name, color) => {
    const trimmed = name.trim().slice(0, 24);
    if (!trimmed) return null;
    const workspace = get().workspaces.find((w) => w.id === workspaceId);
    if (!workspace) return null;
    if (workspace.labels.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) return null;
    try {
      const saved = await workspaceApi.createLabel({ data: { workspaceId, name: trimmed, color } });
      set((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.id === workspaceId ? { ...w, labels: [...w.labels, saved] } : w,
        ),
      }));
      return saved;
    } catch {
      toast.error("Não foi possível criar a etiqueta.");
      return null;
    }
  },
  renameLabel: (workspaceId, labelId, name) => {
    const trimmed = name.trim().slice(0, 24);
    if (!trimmed) return;
    const snapshot = snapshotOf(get());
    let renamed = false;
    set((s) => {
      const ws = s.workspaces.find((w) => w.id === workspaceId);
      if (!ws) return {};
      const label = ws.labels.find((l) => l.id === labelId);
      if (!label) return {};
      if (ws.labels.some((l) => l.id !== labelId && l.name.toLowerCase() === trimmed.toLowerCase()))
        return {};
      const oldName = label.name;
      renamed = true;
      return {
        workspaces: s.workspaces.map((w) =>
          w.id === workspaceId
            ? {
                ...w,
                labels: w.labels.map((l) => (l.id === labelId ? { ...l, name: trimmed } : l)),
              }
            : w,
        ),
        tasks: s.tasks.map((t) =>
          t.workspaceId === workspaceId
            ? { ...t, labels: t.labels.map((l) => (l === oldName ? trimmed : l)) }
            : t,
        ),
      };
    });

    if (renamed) {
      writeThrough(
        snapshot,
        () => workspaceApi.updateLabel({ data: { id: labelId, patch: { name: trimmed } } }),
        () => undefined,
        "Não foi possível renomear a etiqueta.",
      );
    }
  },
  updateLabelColor: (workspaceId, labelId, color) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? { ...w, labels: w.labels.map((l) => (l.id === labelId ? { ...l, color } : l)) }
          : w,
      ),
    }));

    writeThrough(
      snapshot,
      () => workspaceApi.updateLabel({ data: { id: labelId, patch: { color } } }),
      () => undefined,
      "Não foi possível mudar a cor da etiqueta.",
    );
  },
  deleteLabel: (workspaceId, labelId) => {
    const snapshot = snapshotOf(get());
    set((s) => {
      const ws = s.workspaces.find((w) => w.id === workspaceId);
      if (!ws) return {};
      const label = ws.labels.find((l) => l.id === labelId);
      if (!label) return {};
      return {
        workspaces: s.workspaces.map((w) =>
          w.id === workspaceId ? { ...w, labels: w.labels.filter((l) => l.id !== labelId) } : w,
        ),
        tasks: s.tasks.map((t) =>
          t.workspaceId === workspaceId
            ? { ...t, labels: t.labels.filter((l) => l !== label.name) }
            : t,
        ),
      };
    });

    writeThrough(
      snapshot,
      () => workspaceApi.deleteLabel({ data: { id: labelId } }),
      () => undefined,
      "Não foi possível excluir a etiqueta.",
    );
  },

  /* legacy member creation removed; invitations are handled by createInvite */
  /*
    if (created) {
      const member: Member = created;
      writeThrough(
        snapshot,
        () =>
            data: {
              workspaceId,
              name: member.name,
              email: member.email,
              color: member.color,
              role: member.role,
            },
          }),
        // O membro passa a ser um usuário de verdade: o id provisório vira o id
        // do usuário, que é o que `Task.assigneeId` referencia.
        (saved) => replaceWorkspace(saved.workspace),
        "Não foi possível adicionar o membro.",
      );
    }

    return created;
  }, */
  updateMember: (workspaceId, memberId, data) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              members: w.members.map((m) => (m.id === memberId ? { ...m, ...data } : m)),
            }
          : w,
      ),
    }));

    writeThrough(
      snapshot,
      () =>
        workspaceApi.updateMember({
          data: {
            workspaceId,
            userId: memberId,
            patch: {
              role: data.role,
              permission: data.permission,
              projectIds: data.projectIds,
            },
          },
        }),
      replaceWorkspace,
      "Não foi possível salvar o membro.",
    );
  },
  removeMember: (workspaceId, memberId) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, members: w.members.filter((m) => m.id !== memberId) } : w,
      ),
      tasks: s.tasks.map((t) =>
        t.workspaceId === workspaceId &&
        (t.assigneeId === memberId || t.assigneeIds?.includes(memberId))
          ? {
              ...t,
              assigneeIds: (t.assigneeIds ?? []).filter((id) => id !== memberId),
              ...(t.assigneeId === memberId && {
                assigneeId: undefined,
                assignee: undefined,
              }),
            }
          : t,
      ),
    }));

    writeThrough(
      snapshot,
      () => workspaceApi.removeMember({ data: { workspaceId, userId: memberId } }),
      replaceWorkspace,
      "Não foi possível remover o membro.",
    );
  },

  createSprint: async (workspaceId, data) => {
    const name = data.name.trim().slice(0, 60);
    if (!name) return null;
    try {
      const saved = await workspaceApi.createSprint({
        data: {
          workspaceId,
          projectId: activeProjectIdFor(
            get().workspaces.find((workspace) => workspace.id === workspaceId),
            get().activeProjectIds,
          ),
          name,
          goal: data.goal?.trim() || undefined,
          startDate: data.startDate,
          endDate: data.endDate,
          status: data.status ?? "planned",
        },
      });
      replaceWorkspace(saved.workspace);
      return saved.sprint;
    } catch {
      toast.error("Não foi possível criar o sprint.");
      return null;
    }
  },
  updateSprint: (workspaceId, sprintId, data) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              sprints: w.sprints.map((sp) => (sp.id === sprintId ? { ...sp, ...data } : sp)),
            }
          : w,
      ),
    }));
    writeThrough(
      snapshot,
      () => workspaceApi.updateSprint({ data: { id: sprintId, patch: data } }),
      (saved) => replaceWorkspace(saved.workspace),
      "Não foi possível salvar o sprint.",
    );
  },
  deleteSprint: (workspaceId, sprintId) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, sprints: w.sprints.filter((sp) => sp.id !== sprintId) } : w,
      ),
      tasks: s.tasks.map((t) =>
        t.workspaceId === workspaceId && t.sprintId === sprintId
          ? { ...t, sprintId: undefined }
          : t,
      ),
    }));
    writeThrough(
      snapshot,
      () => workspaceApi.deleteSprint({ data: { id: sprintId } }),
      (saved) => replaceWorkspace(saved.workspace),
      "Não foi possível excluir o sprint.",
    );
  },

  createCustomField: async (workspaceId, data) => {
    const name = data.name.trim().slice(0, 40);
    if (!name) return null;
    const options =
      data.type === "select"
        ? (data.options ?? [])
            .map((option) => option.trim())
            .filter(Boolean)
            .slice(0, 20)
        : undefined;
    try {
      const saved = await workspaceApi.createCustomField({
        data: { workspaceId, name, type: data.type, options },
      });
      replaceWorkspace(saved.workspace);
      return saved.field;
    } catch {
      toast.error("Não foi possível criar o campo.");
      return null;
    }
  },
  updateCustomField: (workspaceId, fieldId, data) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              customFields: w.customFields.map((f) => (f.id === fieldId ? { ...f, ...data } : f)),
            }
          : w,
      ),
    }));
    writeThrough(
      snapshot,
      () => workspaceApi.updateCustomField({ data: { id: fieldId, patch: data } }),
      (saved) => replaceWorkspace(saved.workspace),
      "Não foi possível salvar o campo.",
    );
  },
  deleteCustomField: (workspaceId, fieldId) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? { ...w, customFields: w.customFields.filter((f) => f.id !== fieldId) }
          : w,
      ),
      tasks: s.tasks.map((t) => {
        if (t.workspaceId !== workspaceId) return t;
        if (!(fieldId in t.customFields)) return t;
        const { [fieldId]: _drop, ...rest } = t.customFields;
        void _drop;
        return { ...t, customFields: rest };
      }),
    }));
    writeThrough(
      snapshot,
      () => workspaceApi.deleteCustomField({ data: { id: fieldId } }),
      (saved) => replaceWorkspace(saved.workspace),
      "Não foi possível excluir o campo.",
    );
  },

  createDoc: async (workspaceId, title) => {
    const trimmed = title.trim().slice(0, 80);
    if (!trimmed) return null;
    if (!get().workspaces.some((workspace) => workspace.id === workspaceId)) return null;
    try {
      const saved = await workspaceApi.createDoc({
        data: {
          workspaceId,
          projectId: activeProjectIdFor(
            get().workspaces.find((workspace) => workspace.id === workspaceId),
            get().activeProjectIds,
          ),
          title: trimmed,
        },
      });
      replaceWorkspace(saved.workspace);
      return saved.doc;
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível criar o documento.");
      return null;
    }
  },
  updateDoc: (workspaceId, docId, data) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              docs: w.docs.map((d) =>
                d.id === docId ? { ...d, ...data, updatedAt: new Date().toISOString() } : d,
              ),
            }
          : w,
      ),
    }));
    writeThrough(
      snapshot,
      () => workspaceApi.updateDoc({ data: { id: docId, patch: data } }),
      (saved) => replaceWorkspace(saved.workspace),
      "Não foi possível salvar o documento.",
    );
  },
  deleteDoc: (workspaceId, docId) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, docs: w.docs.filter((d) => d.id !== docId) } : w,
      ),
    }));
    writeThrough(
      snapshot,
      () => workspaceApi.deleteDoc({ data: { id: docId } }),
      (saved) => replaceWorkspace(saved.workspace),
      "Não foi possível excluir o documento.",
    );
  },

  createWhiteboard: async (workspaceId, title) => {
    const trimmed = title.trim().slice(0, 80);
    if (!trimmed) return null;
    if (!get().workspaces.some((workspace) => workspace.id === workspaceId)) return null;
    try {
      const saved = await workspaceApi.createWhiteboard({
        data: {
          workspaceId,
          projectId: activeProjectIdFor(
            get().workspaces.find((workspace) => workspace.id === workspaceId),
            get().activeProjectIds,
          ),
          title: trimmed,
        },
      });
      replaceWorkspace(saved.workspace);
      return saved.whiteboard;
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível criar o quadro.");
      return null;
    }
  },
  renameWhiteboard: (workspaceId, whiteboardId, title) => {
    const trimmed = title.trim().slice(0, 80);
    if (!trimmed) return;
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              whiteboards: w.whiteboards.map((board) =>
                board.id === whiteboardId ? { ...board, title: trimmed } : board,
              ),
            }
          : w,
      ),
    }));
    writeThrough(
      snapshot,
      () =>
        workspaceApi.updateWhiteboard({ data: { id: whiteboardId, patch: { title: trimmed } } }),
      () => {},
      "Não foi possível renomear o quadro.",
    );
  },
  deleteWhiteboard: (workspaceId, whiteboardId) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? { ...w, whiteboards: w.whiteboards.filter((board) => board.id !== whiteboardId) }
          : w,
      ),
    }));
    writeThrough(
      snapshot,
      () => workspaceApi.deleteWhiteboard({ data: { id: whiteboardId } }),
      (saved) => replaceWorkspace(saved.workspace),
      "Não foi possível excluir o quadro.",
    );
  },

  createGoal: async (workspaceId, data) => {
    const name = data.name.trim().slice(0, 80);
    if (!name) return null;
    try {
      const saved = await workspaceApi.createGoal({
        data: {
          workspaceId,
          projectId: activeProjectIdFor(
            get().workspaces.find((workspace) => workspace.id === workspaceId),
            get().activeProjectIds,
          ),
          name,
          description: data.description?.trim() || undefined,
          dueDate: data.dueDate,
          taskIds: data.taskIds,
          sprintIds: data.sprintIds,
        },
      });
      replaceWorkspace(saved.workspace);
      return saved.goal;
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível criar a meta.");
      return null;
    }
  },
  updateGoal: (workspaceId, goalId, data) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? { ...w, goals: w.goals.map((g) => (g.id === goalId ? { ...g, ...data } : g)) }
          : w,
      ),
    }));
    writeThrough(
      snapshot,
      () => workspaceApi.updateGoal({ data: { id: goalId, patch: data } }),
      (saved) => replaceWorkspace(saved.workspace),
      "Não foi possível salvar a meta.",
    );
  },
  deleteGoal: (workspaceId, goalId) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, goals: w.goals.filter((g) => g.id !== goalId) } : w,
      ),
    }));
    writeThrough(
      snapshot,
      () => workspaceApi.deleteGoal({ data: { id: goalId } }),
      (saved) => replaceWorkspace(saved.workspace),
      "Não foi possível excluir a meta.",
    );
  },
  toggleGoalTask: (workspaceId, goalId, taskId) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              goals: w.goals.map((g) =>
                g.id === goalId
                  ? {
                      ...g,
                      taskIds: g.taskIds.includes(taskId)
                        ? g.taskIds.filter((x) => x !== taskId)
                        : [...g.taskIds, taskId],
                    }
                  : g,
              ),
            }
          : w,
      ),
    }));
    writeThrough(
      snapshot,
      () => workspaceApi.toggleGoalTask({ data: { goalId, taskId } }),
      (saved) => replaceWorkspace(saved.workspace),
      "Não foi possível atualizar a meta.",
    );
  },
  toggleGoalSprint: (workspaceId, goalId, sprintId) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              goals: w.goals.map((g) =>
                g.id === goalId
                  ? {
                      ...g,
                      sprintIds: g.sprintIds.includes(sprintId)
                        ? g.sprintIds.filter((x) => x !== sprintId)
                        : [...g.sprintIds, sprintId],
                    }
                  : g,
              ),
            }
          : w,
      ),
    }));
    writeThrough(
      snapshot,
      () => workspaceApi.toggleGoalSprint({ data: { goalId, sprintId } }),
      (saved) => replaceWorkspace(saved.workspace),
      "Não foi possível atualizar a meta.",
    );
  },

  createAutomation: (workspaceId, data) => {
    const name = data.name.trim().slice(0, 80);
    if (!name) return null;
    const snapshot = snapshotOf(get());
    let created: Automation | null = null;
    set((s) => {
      const ws = s.workspaces.find((w) => w.id === workspaceId);
      if (!ws) return {};
      const auto: Automation = {
        id: uid(),
        name,
        enabled: data.enabled ?? true,
        trigger: data.trigger,
        action: data.action,
        createdAt: new Date().toISOString(),
      };
      created = auto;
      return {
        workspaces: s.workspaces.map((w) =>
          w.id === workspaceId ? { ...w, automations: [...w.automations, auto] } : w,
        ),
      };
    });
    if (created)
      writeThrough(
        snapshot,
        () =>
          workspaceApi.createAutomation({
            data: {
              workspaceId,
              name,
              enabled: data.enabled,
              trigger: data.trigger,
              action: data.action,
            },
          }),
        (saved) => replaceWorkspace(saved.workspace),
        "Não foi possível criar a automação.",
      );
    return created;
  },
  updateAutomation: (workspaceId, id, data) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              automations: w.automations.map((a) => (a.id === id ? { ...a, ...data } : a)),
            }
          : w,
      ),
    }));
    writeThrough(
      snapshot,
      () => workspaceApi.updateAutomation({ data: { id, patch: data } }),
      (saved) => replaceWorkspace(saved.workspace),
      "Não foi possível salvar a automação.",
    );
  },
  deleteAutomation: (workspaceId, id) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, automations: w.automations.filter((a) => a.id !== id) } : w,
      ),
    }));
    writeThrough(
      snapshot,
      () => workspaceApi.deleteAutomation({ data: { id } }),
      (saved) => replaceWorkspace(saved.workspace),
      "Não foi possível excluir a automação.",
    );
  },

  createTask: (data) => {
    const { subtaskTitles = [], ...taskData } = data;
    const workspace = get().workspaces.find((item) => item.id === taskData.workspaceId);
    const projectId = taskData.projectId ?? activeProjectIdFor(workspace, get().activeProjectIds);
    const persistedData = { ...taskData, projectId, subtaskTitles };
    const author = requireProfile(get().profile).name;
    const position = get().tasks.filter(
      (task) =>
        task.workspaceId === taskData.workspaceId &&
        task.projectId === projectId &&
        task.status === taskData.status,
    ).length;
    const task: Task = {
      labels: [],
      comments: [],
      timeEntries: [],
      customFields: {},
      activity: [
        {
          id: uid(),
          kind: "created",
          text: "criou a tarefa",
          author,
          createdAt: new Date().toISOString(),
        },
      ],
      blockedBy: [],
      attachments: [],
      pullRequests: [],
      position,
      ...taskData,
      projectId,
      subtasks:
        taskData.subtasks ?? subtaskTitles.map((title) => ({ id: uid(), title, done: false })),
      id: uid(),
      createdAt: new Date().toISOString(),
    };
    const snapshot = snapshotOf(get());
    set((s) => ({ tasks: [task, ...s.tasks] }));

    writeThrough(
      snapshot,
      () => taskApi.createTask({ data: persistedData }),
      // O id local é provisório: o definitivo vem do banco.
      (saved) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? saved : t)) })),
      "Não foi possível criar a tarefa.",
    );

    return task;
  },
  updateTask: (id, data) => {
    const author = requireProfile(get().profile).name;
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        const prevStatus = t.status;
        let next: Task = { ...t, ...data };
        const logs: string[] = [];
        if (data.status !== undefined && data.status !== t.status) {
          logs.push(`mudou status para "${statusLabels[data.status]}"`);
        }
        if (data.priority !== undefined && data.priority !== t.priority) {
          logs.push(`mudou prioridade para "${priorityLabels[data.priority]}"`);
        }
        if (data.assigneeIds !== undefined) {
          logs.push(
            data.assigneeIds.length ? "atualizou os responsáveis" : "removeu os responsáveis",
          );
        }
        if (data.dueDate !== undefined && data.dueDate !== t.dueDate) {
          logs.push(data.dueDate ? "atualizou o prazo" : "removeu o prazo");
        }
        if (data.sprintId !== undefined && data.sprintId !== t.sprintId) {
          logs.push(data.sprintId ? "adicionou ao sprint" : "removeu do sprint");
        }
        for (const line of logs) next = withActivity(next, "status", line, author);
        if (data.status !== undefined && data.status !== prevStatus) {
          const ws = s.workspaces.find((w) => w.id === next.workspaceId);
          next = applyAutomations(next, ws, prevStatus, author);
        }
        return next;
      }),
    }));

    writeThrough(
      snapshot,
      () => taskApi.updateTask({ data: { id, patch: data } }),
      (saved) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? saved : t)) })),
      "Não foi possível salvar a tarefa.",
    );
  },
  deleteTask: async (id) => {
    try {
      await taskApi.deleteTask({ data: { id } });
      dataRevision += 1;
      set((s) => {
        const profile = requireProfile(s.profile);
        return {
          tasks: s.tasks
            .filter((task) => task.id !== id)
            .map((task) =>
              task.blockedBy.includes(id)
                ? { ...task, blockedBy: task.blockedBy.filter((blockerId) => blockerId !== id) }
                : task,
            ),
          profile: {
            ...profile,
            pinnedTasks: profile.pinnedTasks.filter((taskId) => taskId !== id),
          },
        };
      });
      return true;
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível excluir a tarefa.");
      return false;
    }
  },
  moveTask: (id, status, requestedPosition) => {
    const author = requireProfile(get().profile).name;
    const snapshot = snapshotOf(get());
    set((s) => {
      const current = s.tasks.find((task) => task.id === id);
      if (!current) return {};
      const source = s.tasks
        .filter(
          (task) =>
            task.workspaceId === current.workspaceId &&
            task.projectId === current.projectId &&
            task.status === current.status &&
            task.id !== id,
        )
        .sort((a, b) => a.position - b.position);
      const target = s.tasks
        .filter(
          (task) =>
            task.workspaceId === current.workspaceId &&
            task.projectId === current.projectId &&
            task.status === status &&
            task.id !== id,
        )
        .sort((a, b) => a.position - b.position);
      const position = Math.min(requestedPosition ?? target.length, target.length);
      target.splice(position, 0, current);
      const nextById = new Map<string, Task>();
      if (current.status !== status) {
        for (const [index, task] of source.entries()) {
          nextById.set(task.id, { ...task, position: index });
        }
      }
      for (const [index, task] of target.entries()) {
        nextById.set(task.id, { ...task, status, position: index });
      }
      let moved = nextById.get(id)!;
      if (current.status !== status) {
        moved = withActivity(moved, "status", `moveu para "${statusLabels[status]}"`, author);
        const workspace = s.workspaces.find((item) => item.id === moved.workspaceId);
        moved = applyAutomations(moved, workspace, current.status, author);
        nextById.set(id, moved);
      }
      return { tasks: s.tasks.map((task) => nextById.get(task.id) ?? task) };
    });

    writeThrough(
      snapshot,
      () => taskApi.moveTask({ data: { id, status, position: requestedPosition } }),
      (saved) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? saved : t)) })),
      "Não foi possível mover a tarefa.",
    );
  },
  moveTaskToColumn: (id, boardColumnId, requestedPosition) => {
    const snapshot = snapshotOf(get());
    set((state) => {
      const current = state.tasks.find((task) => task.id === id);
      if (!current) return {};
      const project = state.workspaces
        .flatMap((workspace) => workspace.projects ?? [])
        .find((item) => item.id === current.projectId);
      const column = project?.boardColumns?.find((item) => item.id === boardColumnId);
      if (!column) return {};
      const source = state.tasks
        .filter((task) => task.boardColumnId === current.boardColumnId && task.id !== id)
        .sort((a, b) => a.position - b.position);
      const target = state.tasks
        .filter((task) => task.boardColumnId === boardColumnId && task.id !== id)
        .sort((a, b) => a.position - b.position);
      const position = Math.min(requestedPosition ?? target.length, target.length);
      target.splice(position, 0, current);
      const nextById = new Map<string, Task>();
      for (const [index, task] of source.entries())
        nextById.set(task.id, { ...task, position: index });
      for (const [index, task] of target.entries()) {
        nextById.set(task.id, {
          ...task,
          boardColumnId,
          status: column.status,
          position: index,
        });
      }
      return { tasks: state.tasks.map((task) => nextById.get(task.id) ?? task) };
    });
    writeThrough(
      snapshot,
      () => taskApi.moveTaskToColumn({ data: { id, boardColumnId, position: requestedPosition } }),
      (saved) =>
        set((state) => ({ tasks: state.tasks.map((task) => (task.id === id ? saved : task)) })),
      "Não foi possível mover a tarefa.",
    );
  },

  addBlocker: (taskId, blockerId) => {
    const author = requireProfile(get().profile).name;
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== taskId) return t;
        if (t.blockedBy.includes(blockerId) || blockerId === taskId) return t;
        const blocker = s.tasks.find((x) => x.id === blockerId);
        return withActivity(
          { ...t, blockedBy: [...t.blockedBy, blockerId] },
          "dependency",
          `bloqueado por "${blocker?.title ?? "tarefa"}"`,
          author,
        );
      }),
    }));
    writeThrough(
      snapshot,
      () => taskApi.addBlocker({ data: { taskId, blockerId } }),
      replaceTask,
      "Não foi possível adicionar o bloqueio.",
    );
  },
  removeBlocker: (taskId, blockerId) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, blockedBy: t.blockedBy.filter((x) => x !== blockerId) } : t,
      ),
    }));
    writeThrough(
      snapshot,
      () => taskApi.removeBlocker({ data: { taskId, blockerId } }),
      replaceTask,
      "Não foi possível remover o bloqueio.",
    );
  },

  addAttachment: async (taskId, input) => {
    dataRevision += 1;
    pendingWrites += 1;
    try {
      const saved = await taskApi.addAttachment({ data: { taskId, ...input } });
      dataRevision += 1;
      replaceTask(saved);
    } catch (error) {
      dataRevision += 1;
      console.error(error);
      toast.error("Não foi possível enviar o anexo.");
      throw error;
    } finally {
      pendingWrites -= 1;
    }
  },
  removeAttachment: (taskId, attachmentId) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              attachments: task.attachments.filter((item) => item.id !== attachmentId),
            }
          : task,
      ),
    }));
    writeThrough(
      snapshot,
      () => taskApi.removeAttachment({ data: { taskId, attachmentId } }),
      replaceTask,
      "Não foi possível remover o anexo.",
    );
  },

  linkPullRequest: async (taskId, url) => {
    const saved = await taskApi.linkPullRequest({ data: { taskId, url } });
    replaceTask(saved);
  },
  refreshPullRequest: async (taskId, linkId) => {
    const saved = await taskApi.refreshPullRequest({ data: { taskId, linkId } });
    replaceTask(saved);
  },
  removePullRequest: async (taskId, linkId) => {
    const saved = await taskApi.removePullRequest({ data: { taskId, linkId } });
    replaceTask(saved);
  },

  addComment: (taskId, author, text) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? withActivity(
              {
                ...t,
                comments: [
                  ...t.comments,
                  { id: uid(), author, text, createdAt: new Date().toISOString() },
                ],
              },
              "comment",
              "comentou",
              author,
            )
          : t,
      ),
    }));
    writeThrough(
      snapshot,
      () => taskApi.addComment({ data: { taskId, text } }),
      replaceTask,
      "Não foi possível salvar o comentário.",
    );
  },
  deleteComment: (taskId, commentId) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, comments: t.comments.filter((c) => c.id !== commentId) } : t,
      ),
    }));
    writeThrough(
      snapshot,
      () => taskApi.deleteComment({ data: { taskId, commentId } }),
      replaceTask,
      "Não foi possível excluir o comentário.",
    );
  },

  addSubtask: (taskId, title) => {
    const trimmed = title.trim().slice(0, 120);
    if (!trimmed) return;
    const author = requireProfile(get().profile).name;
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? withActivity(
              { ...t, subtasks: [...t.subtasks, { id: uid(), title: trimmed, done: false }] },
              "subtask",
              `adicionou subtarefa "${trimmed}"`,
              author,
            )
          : t,
      ),
    }));
    writeThrough(
      snapshot,
      () => taskApi.addSubtask({ data: { taskId, title: trimmed } }),
      replaceTask,
      "Não foi possível criar a subtarefa.",
    );
  },
  toggleSubtask: (taskId, subtaskId) => {
    const author = requireProfile(get().profile).name;
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const sub = t.subtasks.find((x) => x.id === subtaskId);
        if (!sub) return t;
        const nextDone = !sub.done;
        return withActivity(
          {
            ...t,
            subtasks: t.subtasks.map((x) => (x.id === subtaskId ? { ...x, done: nextDone } : x)),
          },
          "subtask",
          `${nextDone ? "concluiu" : "reabriu"} "${sub.title}"`,
          author,
        );
      }),
    }));
    writeThrough(
      snapshot,
      () => taskApi.toggleSubtask({ data: { taskId, subtaskId } }),
      replaceTask,
      "Não foi possível atualizar a subtarefa.",
    );
  },
  renameSubtask: (taskId, subtaskId, title) => {
    const trimmed = title.trim().slice(0, 120);
    if (!trimmed) return;
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              subtasks: t.subtasks.map((x) => (x.id === subtaskId ? { ...x, title: trimmed } : x)),
            }
          : t,
      ),
    }));
    writeThrough(
      snapshot,
      () => taskApi.renameSubtask({ data: { taskId, subtaskId, title: trimmed } }),
      replaceTask,
      "Não foi possível renomear a subtarefa.",
    );
  },
  removeSubtask: (taskId, subtaskId) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, subtasks: t.subtasks.filter((x) => x.id !== subtaskId) } : t,
      ),
    }));
    writeThrough(
      snapshot,
      () => taskApi.removeSubtask({ data: { taskId, subtaskId } }),
      replaceTask,
      "Não foi possível excluir a subtarefa.",
    );
  },

  addTimeEntry: (taskId, minutes, note, author) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? withActivity(
              {
                ...t,
                timeEntries: [
                  ...t.timeEntries,
                  {
                    id: uid(),
                    minutes: Math.round(minutes),
                    note: note?.trim() || undefined,
                    author,
                    createdAt: new Date().toISOString(),
                  },
                ],
              },
              "time",
              `registrou ${Math.round(minutes)} min`,
              author,
            )
          : t,
      ),
    }));
    writeThrough(
      snapshot,
      () =>
        taskApi.addTimeEntry({
          data: { taskId, minutes: Math.round(minutes), note: note?.trim() || undefined },
        }),
      replaceTask,
      "Não foi possível registrar o tempo.",
    );
  },
  removeTimeEntry: (taskId, entryId) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, timeEntries: t.timeEntries.filter((e) => e.id !== entryId) } : t,
      ),
    }));
    writeThrough(
      snapshot,
      () => taskApi.removeTimeEntry({ data: { taskId, entryId } }),
      replaceTask,
      "Não foi possível remover o apontamento.",
    );
  },
  setEstimate: (taskId, minutes) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, estimateMinutes: minutes } : t)),
    }));
    writeThrough(
      snapshot,
      () => taskApi.setEstimate({ data: { taskId, minutes: minutes ?? null } }),
      replaceTask,
      "Não foi possível salvar a estimativa.",
    );
  },

  setFieldValue: (taskId, fieldId, value) => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const next = { ...t.customFields };
        if (value === null || value === "" || value === undefined) delete next[fieldId];
        else next[fieldId] = value;
        return { ...t, customFields: next };
      }),
    }));
    writeThrough(
      snapshot,
      () => taskApi.setFieldValue({ data: { taskId, fieldId, value } }),
      replaceTask,
      "Não foi possível salvar o campo.",
    );
  },

  updateProfile: async (data) => {
    dataRevision += 1;
    pendingWrites += 1;
    try {
      const profile = await profileApi.updateProfile({ data });
      dataRevision += 1;
      set({ profile });
      return profile;
    } catch (error) {
      dataRevision += 1;
      console.error(error);
      toast.error("Não foi possível salvar o perfil.");
      throw error;
    } finally {
      pendingWrites -= 1;
    }
  },
  togglePinWorkspace: (workspaceId) => {
    const snapshot = snapshotOf(get());
    set((s) => {
      const profile = requireProfile(s.profile);
      return {
        profile: {
          ...profile,
          pinnedWorkspaces: profile.pinnedWorkspaces.includes(workspaceId)
            ? profile.pinnedWorkspaces.filter((x) => x !== workspaceId)
            : [...profile.pinnedWorkspaces, workspaceId],
        },
      };
    });
    writeThrough(
      snapshot,
      () => profileApi.togglePinWorkspace({ data: { workspaceId } }),
      (profile) => set({ profile }),
      "Não foi possível salvar o favorito.",
    );
  },
  togglePinTask: (taskId) => {
    const snapshot = snapshotOf(get());
    set((s) => {
      const profile = requireProfile(s.profile);
      return {
        profile: {
          ...profile,
          pinnedTasks: profile.pinnedTasks.includes(taskId)
            ? profile.pinnedTasks.filter((x) => x !== taskId)
            : [...profile.pinnedTasks, taskId],
        },
      };
    });
    writeThrough(
      snapshot,
      () => profileApi.togglePinTask({ data: { taskId } }),
      (profile) => set({ profile }),
      "Não foi possível salvar o favorito.",
    );
  },
  markNotificationsRead: () => {
    const snapshot = snapshotOf(get());
    set((s) => ({
      profile: { ...requireProfile(s.profile), notificationsReadAt: new Date().toISOString() },
    }));
    writeThrough(
      snapshot,
      () => profileApi.markNotificationsRead(),
      (profile) => set({ profile }),
      "Não foi possível marcar notificações.",
    );
  },
})); /*
    {
      name: "flow-tasks-store",
      version: 7,
      migrate: (persisted) => {
        const state = persisted as
          { tasks?: Task[]; workspaces?: Workspace[]; profile?: Partial<Profile> } | undefined;
        if (!state) return state as never;
        if (state.tasks) {
          state.tasks = state.tasks.map((t) => ({
            ...t,
            labels: t.labels ?? [],
            comments: t.comments ?? [],
            subtasks: t.subtasks ?? [],
            timeEntries: t.timeEntries ?? [],
            customFields: t.customFields ?? {},
            activity: t.activity ?? [],
            blockedBy: t.blockedBy ?? [],
          }));
        }
        if (state.workspaces) {
          state.workspaces = state.workspaces.map((w, wi) => {
            const labels =
              w.labels && Array.isArray(w.labels)
                ? w.labels
                : Array.from(
                    new Set(
                      (state.tasks ?? [])
                        .filter((t) => t.workspaceId === w.id)
                        .flatMap((t) => t.labels ?? []),
                    ),
                  ).map((name, i) => ({ id: uid(), name, color: pickColor(i) }));
            const members =
              w.members && Array.isArray(w.members)
                ? w.members
                : [{ id: "mem-me", name: "Você", color: pickColor(wi), role: "Owner" }];
            return {
              ...w,
              labels,
              members,
              sprints: w.sprints ?? [],
              customFields: w.customFields ?? [],
              docs: w.docs ?? [],
              goals: w.goals ?? [],
              automations: w.automations ?? [],
            };
          });
        }
        state.profile = {
          ...defaultProfile,
          ...(state.profile ?? {}),
          pinnedWorkspaces: state.profile?.pinnedWorkspaces ?? [],
          pinnedTasks: state.profile?.pinnedTasks ?? [],
        };
        (state as { integrations?: Record<string, unknown[]> }).integrations =
          (state as { integrations?: Record<string, unknown[]> }).integrations ?? {};
        return state as never;
      },
    },
  ),
); */

export const statusLabels: Record<TaskStatus, string> = {
  todo: "A fazer",
  in_progress: "Em progresso",
  done: "Concluído",
};

export const priorityLabels: Record<TaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

export const formatMinutes = (m: number) => {
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h && min) return `${h}h ${min}m`;
  if (h) return `${h}h`;
  return `${min}m`;
};
