import type {
  GitHubConnectionStatus,
  GitHubRepository,
  GitHubRepositoryActivity,
} from "@task-flow/shared/domain/github-contracts";

import { api } from "./client";

export const githubStatus = (workspaceId: string): Promise<GitHubConnectionStatus> =>
  api.get(`/api/workspaces/${workspaceId}/github/status`);

export const githubRepositories = (workspaceId: string): Promise<GitHubRepository[]> =>
  api.get(`/api/workspaces/${workspaceId}/github/repositories`);

export const githubActivity = (
  workspaceId: string,
  repository: string,
  connectionId: string,
): Promise<GitHubRepositoryActivity> =>
  api.get(
    `/api/workspaces/${workspaceId}/github/activity?repository=${encodeURIComponent(repository)}&connectionId=${encodeURIComponent(connectionId)}`,
  );

export const disconnectGitHub = (workspaceId: string): Promise<void> =>
  api.delete(`/api/workspaces/${workspaceId}/github`);

export const disconnectGitHubConnection = (
  workspaceId: string,
  connectionId: string,
): Promise<void> => api.delete(`/api/workspaces/${workspaceId}/github/connections/${connectionId}`);
