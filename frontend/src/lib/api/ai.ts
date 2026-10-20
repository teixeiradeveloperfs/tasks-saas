import type {
  RunbookAiDraft,
  RunbookAiRequest,
  TaskAiDraft,
  TaskAiRequest,
} from "@task-flow/shared/domain/ai-contracts";

import { api } from "./client";

export const generateRunbookDraft = (data: RunbookAiRequest): Promise<RunbookAiDraft> =>
  api.post("/api/ai/runbook-draft", data);

export const generateTaskDraft = (data: TaskAiRequest): Promise<TaskAiDraft> =>
  api.post("/api/ai/task-draft", data);
