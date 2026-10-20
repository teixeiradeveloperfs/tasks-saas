import { activeProjectIdFor, useStore } from "@/lib/store";

export function useActiveProject(workspaceId: string) {
  const workspace = useStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const activeProjectIds = useStore((state) => state.activeProjectIds);
  const projectId = activeProjectIdFor(workspace, activeProjectIds);
  return {
    projectId,
    project: workspace?.projects?.find((item) => item.id === projectId),
  };
}

export function belongsToProject(
  itemProjectId: string | undefined,
  activeProjectId: string | undefined,
): boolean {
  return !activeProjectId || !itemProjectId || itemProjectId === activeProjectId;
}
