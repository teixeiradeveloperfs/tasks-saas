import type { AuditEvent } from "@task-flow/shared/domain/models";

import { api } from "./client";

export type AuditPage = { items: AuditEvent[]; nextCursor?: string };

export const listAudit = (workspaceId: string, cursor?: string): Promise<AuditPage> =>
  api.get(
    `/api/workspaces/${workspaceId}/audit?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  );

export const undoAudit = (id: string): Promise<{ ok: true }> => api.post(`/api/audit/${id}/undo`);
