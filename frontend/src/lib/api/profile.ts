import type { Profile, WorkspaceIntegration } from "@task-flow/shared/domain/models";
import type {
  ToggleIntegrationInput,
  UpdateProfileInput,
} from "@task-flow/shared/domain/auth-contracts";

import { api } from "./client";

export const updateProfile = (a: { data: UpdateProfileInput }): Promise<Profile> =>
  api.patch("/api/profile", a.data);

export const togglePinWorkspace = (a: { data: { workspaceId: string } }): Promise<Profile> =>
  api.patch(`/api/profile/pinned-workspaces/${a.data.workspaceId}`);

export const togglePinTask = (a: { data: { taskId: string } }): Promise<Profile> =>
  api.patch(`/api/profile/pinned-tasks/${a.data.taskId}`);

export const markNotificationsRead = (): Promise<Profile> =>
  api.post("/api/profile/notifications/read");

export const toggleIntegration = (a: {
  data: { workspaceId: string } & ToggleIntegrationInput;
}): Promise<WorkspaceIntegration[]> => {
  const { workspaceId, ...rest } = a.data;
  return api.patch(`/api/workspaces/${workspaceId}/integrations`, rest);
};

export const updateIntegrationConfig = (a: {
  data: { workspaceId: string; integrationId: string; config: Record<string, string> };
}): Promise<WorkspaceIntegration[]> =>
  api.patch(`/api/workspaces/${a.data.workspaceId}/integrations/${a.data.integrationId}/config`, {
    config: a.data.config,
  });
