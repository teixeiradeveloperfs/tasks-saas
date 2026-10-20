import type {
  CustomField,
  Whiteboard,
  BoardColumn,
  Doc,
  Goal,
  Project,
  Runbook,
  Sprint,
  Workspace,
  WorkspaceLabel,
} from "@task-flow/shared/domain/models";
import type {
  AutomationInput,
  BoardColumnInput,
  AutomationPatch,
  CustomFieldInput,
  CustomFieldPatch,
  DocPatch,
  GoalInput,
  GoalPatch,
  LabelInput,
  LabelPatch,
  MemberPatch,
  ProjectInput,
  ProjectPatch,
  RunbookInput,
  RunbookPatch,
  SprintInput,
  SprintPatch,
  WorkspaceInput,
  WorkspacePatch,
} from "@task-flow/shared/domain/workspace-contracts";

import { api } from "./client";

type WorkspaceResult = { workspace: Workspace };

export const createWorkspace = (a: { data: WorkspaceInput }): Promise<Workspace> =>
  api.post("/api/workspaces", a.data);

export const updateWorkspace = (a: {
  data: { id: string; patch: WorkspacePatch };
}): Promise<Workspace> => api.patch(`/api/workspaces/${a.data.id}`, a.data.patch);

export const deleteWorkspace = (a: { data: { id: string } }): Promise<void> =>
  api.delete(`/api/workspaces/${a.data.id}`);

export const createProject = (a: {
  data: { workspaceId: string } & ProjectInput;
}): Promise<{ project: Project } & WorkspaceResult> => {
  const { workspaceId, ...data } = a.data;
  return api.post(`/api/workspaces/${workspaceId}/projects`, data);
};

export const updateProject = (a: {
  data: { id: string; patch: ProjectPatch };
}): Promise<{ project: Project } & WorkspaceResult> =>
  api.patch(`/api/projects/${a.data.id}`, a.data.patch);

export const createBoardColumn = (a: {
  data: { projectId: string } & BoardColumnInput;
}): Promise<{ column: BoardColumn } & WorkspaceResult> => {
  const { projectId, ...data } = a.data;
  return api.post(`/api/projects/${projectId}/columns`, data);
};

export const createRunbook = (a: {
  data: { workspaceId: string } & RunbookInput;
}): Promise<{ runbook: Runbook } & WorkspaceResult> => {
  const { workspaceId, ...data } = a.data;
  return api.post(`/api/workspaces/${workspaceId}/runbooks`, data);
};

export const updateRunbook = (a: {
  data: { id: string; patch: RunbookPatch };
}): Promise<{ runbook: Runbook } & WorkspaceResult> =>
  api.patch(`/api/runbooks/${a.data.id}`, a.data.patch);

export const deleteRunbook = (a: { data: { id: string } }): Promise<WorkspaceResult> =>
  api.delete(`/api/runbooks/${a.data.id}`);

export const toggleRunbookFavorite = (a: { data: { id: string } }): Promise<WorkspaceResult> =>
  api.patch(`/api/runbooks/${a.data.id}/favorite`);

export const toggleRunbookStep = (a: { data: { id: string } }): Promise<WorkspaceResult> =>
  api.patch(`/api/runbook-steps/${a.data.id}/toggle`);

export const createLabel = (a: {
  data: { workspaceId: string } & LabelInput;
}): Promise<WorkspaceLabel> =>
  api.post(`/api/workspaces/${a.data.workspaceId}/labels`, {
    name: a.data.name,
    color: a.data.color,
  });

export const updateLabel = (a: {
  data: { id: string; patch: LabelPatch };
}): Promise<WorkspaceLabel> => api.patch(`/api/labels/${a.data.id}`, a.data.patch);

export const deleteLabel = (a: { data: { id: string } }): Promise<void> =>
  api.delete(`/api/labels/${a.data.id}`);

export const createSprint = (a: {
  data: { workspaceId: string } & SprintInput;
}): Promise<{ sprint: Sprint } & WorkspaceResult> => {
  const { workspaceId, ...rest } = a.data;
  return api.post(`/api/workspaces/${workspaceId}/sprints`, rest);
};

export const updateSprint = (a: {
  data: { id: string; patch: SprintPatch };
}): Promise<{ sprint: Sprint } & WorkspaceResult> =>
  api.patch(`/api/sprints/${a.data.id}`, a.data.patch);

export const deleteSprint = (a: { data: { id: string } }): Promise<WorkspaceResult> =>
  api.delete(`/api/sprints/${a.data.id}`);

export const createCustomField = (a: {
  data: { workspaceId: string } & CustomFieldInput;
}): Promise<{ field: CustomField } & WorkspaceResult> => {
  const { workspaceId, ...rest } = a.data;
  return api.post(`/api/workspaces/${workspaceId}/fields`, rest);
};

export const updateCustomField = (a: {
  data: { id: string; patch: CustomFieldPatch };
}): Promise<{ field: CustomField } & WorkspaceResult> =>
  api.patch(`/api/fields/${a.data.id}`, a.data.patch);

export const deleteCustomField = (a: { data: { id: string } }): Promise<WorkspaceResult> =>
  api.delete(`/api/fields/${a.data.id}`);

export const createDoc = (a: {
  data: { workspaceId: string; projectId?: string; title: string };
}): Promise<{ doc: Doc } & WorkspaceResult> =>
  api.post(`/api/workspaces/${a.data.workspaceId}/docs`, {
    title: a.data.title,
    projectId: a.data.projectId,
  });

export const updateDoc = (a: {
  data: { id: string; patch: DocPatch };
}): Promise<{ doc: Doc } & WorkspaceResult> => api.patch(`/api/docs/${a.data.id}`, a.data.patch);

export const deleteDoc = (a: { data: { id: string } }): Promise<WorkspaceResult> =>
  api.delete(`/api/docs/${a.data.id}`);

export const createWhiteboard = (a: {
  data: { workspaceId: string; projectId?: string; title: string };
}): Promise<{ whiteboard: Whiteboard } & WorkspaceResult> =>
  api.post(`/api/workspaces/${a.data.workspaceId}/whiteboards`, {
    title: a.data.title,
    projectId: a.data.projectId,
  });

export const readWhiteboard = (a: {
  data: { id: string };
}): Promise<Whiteboard & { scene: string }> => api.get(`/api/whiteboards/${a.data.id}`);

export const updateWhiteboard = (a: {
  data: { id: string; patch: { title?: string; scene?: string } };
}): Promise<{ whiteboard: Whiteboard }> => api.patch(`/api/whiteboards/${a.data.id}`, a.data.patch);

export const deleteWhiteboard = (a: { data: { id: string } }): Promise<WorkspaceResult> =>
  api.delete(`/api/whiteboards/${a.data.id}`);

export const createGoal = (a: {
  data: { workspaceId: string } & GoalInput;
}): Promise<{ goal: Goal } & WorkspaceResult> => {
  const { workspaceId, ...rest } = a.data;
  return api.post(`/api/workspaces/${workspaceId}/goals`, rest);
};

export const updateGoal = (a: {
  data: { id: string; patch: GoalPatch };
}): Promise<WorkspaceResult> => api.patch(`/api/goals/${a.data.id}`, a.data.patch);

export const deleteGoal = (a: { data: { id: string } }): Promise<WorkspaceResult> =>
  api.delete(`/api/goals/${a.data.id}`);

export const toggleGoalTask = (a: {
  data: { goalId: string; taskId: string };
}): Promise<WorkspaceResult> =>
  api.patch(`/api/goals/${a.data.goalId}/tasks/${a.data.taskId}/toggle`);

export const toggleGoalSprint = (a: {
  data: { goalId: string; sprintId: string };
}): Promise<WorkspaceResult> =>
  api.patch(`/api/goals/${a.data.goalId}/sprints/${a.data.sprintId}/toggle`);

export const createAutomation = (a: {
  data: { workspaceId: string } & AutomationInput;
}): Promise<WorkspaceResult> => {
  const { workspaceId, ...rest } = a.data;
  return api.post(`/api/workspaces/${workspaceId}/automations`, rest);
};

export const updateAutomation = (a: {
  data: { id: string; patch: AutomationPatch };
}): Promise<WorkspaceResult> => api.patch(`/api/automations/${a.data.id}`, a.data.patch);

export const deleteAutomation = (a: { data: { id: string } }): Promise<WorkspaceResult> =>
  api.delete(`/api/automations/${a.data.id}`);

export const updateMember = (a: {
  data: { workspaceId: string; userId: string; patch: MemberPatch };
}): Promise<Workspace> =>
  api.patch(`/api/workspaces/${a.data.workspaceId}/members/${a.data.userId}`, a.data.patch);

export const removeMember = (a: {
  data: { workspaceId: string; userId: string };
}): Promise<Workspace> =>
  api.delete(`/api/workspaces/${a.data.workspaceId}/members/${a.data.userId}`);
