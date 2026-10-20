import type { BoardData, Task } from "@task-flow/shared/domain/models";

import { api } from "./client";

export const getBoardData = (): Promise<BoardData> => api.get("/api/board");

export const getWorkspaceTasksPage = (
  workspaceId: string,
  cursor?: string,
): Promise<{ items: Task[]; hasMore: boolean; nextCursor?: string }> =>
  api.get(
    `/api/workspaces/${workspaceId}/tasks?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
