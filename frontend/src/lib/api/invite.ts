import type { AcceptInviteInput, CreateInviteInput } from "@task-flow/shared/domain/auth-contracts";

import { api } from "./client";

export type Invite = {
  email: string;
  workspaceName: string;
  hasAccount: boolean;
  authenticated: boolean;
  authenticatedAsInvitee: boolean;
};

export const createInvite = (a: {
  data: CreateInviteInput;
}): Promise<{ token: string; path: string; url: string; expiresInDays: number }> =>
  api.post("/api/invites", a.data);

export const readInvite = (a: { data: { token: string } }): Promise<Invite | null> =>
  api.get(`/api/invites/${encodeURIComponent(a.data.token)}`);

export const acceptInvite = (a: { data: AcceptInviteInput }): Promise<{ workspaceId: string }> => {
  const { token, ...rest } = a.data;
  return api.post(`/api/invites/${encodeURIComponent(token)}/accept`, rest);
};

export const acceptInviteAuthenticated = (a: {
  data: { token: string; role?: string };
}): Promise<{ workspaceId: string }> => {
  const { token, role } = a.data;
  return api.post(`/api/invites/${encodeURIComponent(token)}/accept-authenticated`, { role });
};
