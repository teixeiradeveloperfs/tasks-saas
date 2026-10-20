import type { Member, Workspace } from "@task-flow/shared/domain/models";

export function workspacePermission(
  workspace: Workspace | undefined,
  userId: string | undefined,
): Member["permission"] | undefined {
  return workspace?.members.find((member) => member.id === userId)?.permission;
}

export function canEditWorkspace(workspace: Workspace | undefined, userId: string | undefined) {
  const permission = workspacePermission(workspace, userId);
  return permission !== undefined && permission !== "VIEWER";
}

export function canManageWorkspace(workspace: Workspace | undefined, userId: string | undefined) {
  const permission = workspacePermission(workspace, userId);
  return permission === "OWNER" || permission === "ADMIN";
}
