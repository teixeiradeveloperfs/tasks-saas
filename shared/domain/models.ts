export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface TaskComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}
export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}
export interface TimeEntry {
  id: string;
  minutes: number;
  note?: string;
  author: string;
  createdAt: string;
}

export type ActivityKind =
  | "created"
  | "status"
  | "priority"
  | "assignee"
  | "dueDate"
  | "sprint"
  | "subtask"
  | "time"
  | "comment"
  | "field"
  | "dependency"
  | "automation";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  text: string;
  author: string;
  createdAt: string;
}
export interface WorkspaceLabel {
  id: string;
  name: string;
  color: string;
}
export interface Member {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string;
  email?: string;
  role?: string;
  permission: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  /**
   * Projetos deste workspace a que o membro tem acesso. OWNER e ADMIN enxergam
   * todos por cargo, independente do que houver aqui.
   */
  projectIds?: string[];
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploader: string;
  createdAt: string;
}

export interface TaskPullRequest {
  id: string;
  repositoryFullName: string;
  number: number;
  title: string;
  url: string;
  state: string;
  draft: boolean;
  merged: boolean;
  headSha?: string;
  ciStatus: string;
  ciConclusion?: string;
  checkedAt: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  actor: string;
  createdAt: string;
  undoable: boolean;
}

export type CustomFieldType = "text" | "number" | "select";
export interface CustomField {
  id: string;
  name: string;
  type: CustomFieldType;
  options?: string[];
}
export type CustomFieldValue = string | number | null;

export interface Sprint {
  id: string;
  projectId?: string;
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  status: "planned" | "active" | "closed";
  createdAt: string;
}

export interface Doc {
  id: string;
  projectId?: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}
/**
 * Metadados de um quadro de desenho (Excalidraw). A cena em si não trafega no
 * payload do board — pode ter centenas de KB — e chega por GET próprio ao abrir.
 */
export interface Whiteboard {
  id: string;
  projectId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}
export interface Goal {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  dueDate?: string;
  taskIds: string[];
  sprintIds: string[];
  createdAt: string;
}

export type AutomationTrigger = { kind: "status_changed"; to: TaskStatus };
export type AutomationAction =
  | { kind: "assign"; memberId: string }
  | { kind: "set_priority"; priority: TaskPriority }
  | { kind: "set_sprint"; sprintId: string }
  | { kind: "add_label"; label: string };
export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  action: AutomationAction;
  createdAt: string;
}

export interface Task {
  id: string;
  workspaceId: string;
  projectId?: string;
  boardColumnId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  assigneeId?: string;
  assigneeIds?: string[];
  startDate?: string;
  dueDate?: string;
  labels: string[];
  comments: TaskComment[];
  subtasks: Subtask[];
  timeEntries: TimeEntry[];
  estimateMinutes?: number;
  sprintId?: string;
  customFields: Record<string, CustomFieldValue>;
  activity: ActivityEntry[];
  blockedBy: string[];
  attachments: Attachment[];
  pullRequests: TaskPullRequest[];
  position: number;
  createdAt: string;
}

export interface BoardColumn {
  id: string;
  projectId: string;
  name: string;
  status: TaskStatus;
  color: string;
  position: number;
  createdAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  color: string;
  boardColumns?: BoardColumn[];
  createdAt: string;
}

export type RunbookRisk = "safe" | "caution" | "dangerous";

export interface RunbookStep {
  id: string;
  title: string;
  command: string;
  explanation?: string;
  expectedResult?: string;
  risk: RunbookRisk;
  position: number;
  checked: boolean;
}

export interface RunbookVariable {
  id: string;
  key: string;
  defaultValue?: string;
  description?: string;
  position: number;
}

export interface Runbook {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description?: string;
  category: string;
  environment: string;
  tags: string[];
  favorite: boolean;
  steps: RunbookStep[];
  variables: RunbookVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  color: string;
  description?: string;
  imageUrl?: string;
  projects?: Project[];
  labels: WorkspaceLabel[];
  members: Member[];
  sprints: Sprint[];
  customFields: CustomField[];
  docs: Doc[];
  whiteboards: Whiteboard[];
  goals: Goal[];
  automations: Automation[];
  runbooks: Runbook[];
  createdAt: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarColor: string;
  avatarUrl?: string;
  bio?: string;
  pinnedWorkspaces: string[];
  pinnedTasks: string[];
  notificationsReadAt?: string;
}

export interface WorkspaceIntegration {
  id: string;
  name: string;
  category: string;
  connectedAt: string;
  config?: Record<string, string>;
}

/** Snapshot serializable returned by the first server-backed application read. */
export interface BoardData {
  workspaces: Workspace[];
  tasks: Task[];
  profile: Profile;
  integrations: Record<string, WorkspaceIntegration[]>;
  taskPageInfo: Record<string, { hasMore: boolean; nextCursor?: string }>;
}
