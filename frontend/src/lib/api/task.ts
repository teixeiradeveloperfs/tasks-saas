import type { Task } from "@task-flow/shared/domain/models";
import type {
  AddBlockerInput,
  AddCommentInput,
  AddTimeEntryInput,
  AttachmentInput,
  CreateTaskInput,
  MoveTaskInput,
  MoveTaskToColumnInput,
  SetEstimateInput,
  SetFieldValueInput,
  SubtaskTitleInput,
  UpdateTaskInput,
} from "@task-flow/shared/domain/task-contracts";

import { api } from "./client";

export const createTask = (a: { data: CreateTaskInput }): Promise<Task> =>
  api.post("/api/tasks", a.data);

export const updateTask = (a: { data: { id: string; patch: UpdateTaskInput } }): Promise<Task> =>
  api.patch(`/api/tasks/${a.data.id}`, a.data.patch);

export const moveTask = (a: { data: { id: string } & MoveTaskInput }): Promise<Task> =>
  api.patch(`/api/tasks/${a.data.id}/move`, {
    status: a.data.status,
    position: a.data.position,
  });

export const moveTaskToColumn = (a: {
  data: { id: string } & MoveTaskToColumnInput;
}): Promise<Task> =>
  api.patch(`/api/tasks/${a.data.id}/move-column`, {
    boardColumnId: a.data.boardColumnId,
    position: a.data.position,
  });

export const deleteTask = (a: { data: { id: string } }): Promise<void> =>
  api.delete(`/api/tasks/${a.data.id}`);

export const addComment = (a: { data: { taskId: string } & AddCommentInput }): Promise<Task> =>
  api.post(`/api/tasks/${a.data.taskId}/comments`, { text: a.data.text });

export const deleteComment = (a: { data: { taskId: string; commentId: string } }): Promise<Task> =>
  api.delete(`/api/tasks/${a.data.taskId}/comments/${a.data.commentId}`);

export const addSubtask = (a: { data: { taskId: string } & SubtaskTitleInput }): Promise<Task> =>
  api.post(`/api/tasks/${a.data.taskId}/subtasks`, { title: a.data.title });

export const toggleSubtask = (a: { data: { taskId: string; subtaskId: string } }): Promise<Task> =>
  api.patch(`/api/tasks/${a.data.taskId}/subtasks/${a.data.subtaskId}/toggle`);

export const renameSubtask = (a: {
  data: { taskId: string; subtaskId: string } & SubtaskTitleInput;
}): Promise<Task> =>
  api.patch(`/api/tasks/${a.data.taskId}/subtasks/${a.data.subtaskId}`, { title: a.data.title });

export const removeSubtask = (a: { data: { taskId: string; subtaskId: string } }): Promise<Task> =>
  api.delete(`/api/tasks/${a.data.taskId}/subtasks/${a.data.subtaskId}`);

export const addTimeEntry = (a: { data: { taskId: string } & AddTimeEntryInput }): Promise<Task> =>
  api.post(`/api/tasks/${a.data.taskId}/time-entries`, {
    minutes: a.data.minutes,
    note: a.data.note,
  });

export const removeTimeEntry = (a: { data: { taskId: string; entryId: string } }): Promise<Task> =>
  api.delete(`/api/tasks/${a.data.taskId}/time-entries/${a.data.entryId}`);

export const setEstimate = (a: { data: { taskId: string } & SetEstimateInput }): Promise<Task> =>
  api.patch(`/api/tasks/${a.data.taskId}/estimate`, { minutes: a.data.minutes });

export const setFieldValue = (a: {
  data: { taskId: string; fieldId: string } & SetFieldValueInput;
}): Promise<Task> =>
  api.patch(`/api/tasks/${a.data.taskId}/fields/${a.data.fieldId}`, { value: a.data.value });

export const addBlocker = (a: { data: { taskId: string } & AddBlockerInput }): Promise<Task> =>
  api.post(`/api/tasks/${a.data.taskId}/blockers`, { blockerId: a.data.blockerId });

export const removeBlocker = (a: { data: { taskId: string; blockerId: string } }): Promise<Task> =>
  api.delete(`/api/tasks/${a.data.taskId}/blockers/${a.data.blockerId}`);

export const addAttachment = (a: { data: { taskId: string } & AttachmentInput }): Promise<Task> => {
  const { taskId, ...body } = a.data;
  return api.post(`/api/tasks/${taskId}/attachments`, body);
};

export const removeAttachment = (a: {
  data: { taskId: string; attachmentId: string };
}): Promise<Task> => api.delete(`/api/tasks/${a.data.taskId}/attachments/${a.data.attachmentId}`);

export const linkPullRequest = (a: { data: { taskId: string; url: string } }): Promise<Task> =>
  api.post(`/api/tasks/${a.data.taskId}/github/pull-requests`, { url: a.data.url });

export const refreshPullRequest = (a: {
  data: { taskId: string; linkId: string };
}): Promise<Task> =>
  api.post(`/api/tasks/${a.data.taskId}/github/pull-requests/${a.data.linkId}/refresh`);

export const removePullRequest = (a: { data: { taskId: string; linkId: string } }): Promise<Task> =>
  api.delete(`/api/tasks/${a.data.taskId}/github/pull-requests/${a.data.linkId}`);
