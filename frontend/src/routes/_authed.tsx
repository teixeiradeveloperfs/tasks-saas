import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { getBoardData, getWorkspaceTasksPage } from "@/lib/api/board";
import { me } from "@/lib/api/auth";
import { getDataRevision, useStore } from "@/state/workspace-store";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location }: { location: { href: string } }) => {
    const atual = await me();
    if (!atual.authenticated) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    if (atual.twoFactor === "challenge_required") {
      throw redirect({ to: "/security/two-factor", search: { redirect: location.href } });
    }
  },
  // O loader bloqueia a renderização dos filhos até os dados chegarem. É o que garante
  // que nenhuma tela apareça antes de haver perfil — sem isso seria preciso uma flag de
  // hidratação costurada por todos os componentes que leem o store.
  loader: async () => {
    const startedAtRevision = getDataRevision();
    const data = await getBoardData();
    useStore.getState().hydrateFromServer(data, startedAtRevision);
    return null;
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const workspaces = useStore((state) => state.workspaces);
  const workspaceKey = workspaces.map((workspace) => workspace.id).join("|");

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        const revision = getDataRevision();
        const loadedCounts = new Map<string, number>();
        for (const task of useStore.getState().tasks) {
          loadedCounts.set(task.workspaceId, (loadedCounts.get(task.workspaceId) ?? 0) + 1);
        }
        const data = await getBoardData();
        for (const [workspaceId, loadedCount] of loadedCounts) {
          let pageInfo = data.taskPageInfo[workspaceId];
          while (
            pageInfo?.hasMore &&
            data.tasks.filter((task) => task.workspaceId === workspaceId).length < loadedCount
          ) {
            const page = await getWorkspaceTasksPage(workspaceId, pageInfo.nextCursor);
            data.tasks.push(...page.items);
            pageInfo = { hasMore: page.hasMore, nextCursor: page.nextCursor };
            data.taskPageInfo[workspaceId] = pageInfo;
          }
        }
        useStore.getState().hydrateFromServer(data, revision);
      }, 150);
    };
    const workspaceIds = workspaceKey ? workspaceKey.split("|") : [];
    const streams = workspaceIds.map((workspaceId) => {
      const stream = new EventSource(`/api/workspaces/${workspaceId}/events`);
      stream.addEventListener("board.changed", refresh);
      return stream;
    });
    return () => {
      clearTimeout(refreshTimer);
      for (const stream of streams) stream.close();
    };
  }, [workspaceKey]);

  return <Outlet />;
}
