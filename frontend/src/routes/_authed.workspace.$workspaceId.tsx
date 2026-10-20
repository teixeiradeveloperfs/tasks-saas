import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/workspace/$workspaceId")({
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  return <Outlet />;
}
