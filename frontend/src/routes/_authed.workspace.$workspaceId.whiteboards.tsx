import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, PenTool, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppShell } from "@/components/app-shell";
import { ReadOnlyNotice } from "@/components/read-only-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canEditWorkspace } from "@/lib/workspace-access";
import { useProfile, useStore } from "@/state/workspace-store";
import { belongsToProject, useActiveProject } from "@/state/use-active-project";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/whiteboards")({
  component: WhiteboardsPage,
});

function WhiteboardsPage() {
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const workspace = useStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const { projectId: activeProjectId } = useActiveProject(workspaceId);
  const whiteboards = useMemo(
    () =>
      workspace?.whiteboards.filter((board) =>
        belongsToProject(board.projectId, activeProjectId),
      ) ?? [],
    [activeProjectId, workspace?.whiteboards],
  );
  const profile = useProfile();
  const createWhiteboard = useStore((s) => s.createWhiteboard);
  const renameWhiteboard = useStore((s) => s.renameWhiteboard);
  const deleteWhiteboard = useStore((s) => s.deleteWhiteboard);

  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  if (!workspace) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <h1 className="text-xl font-semibold">Workspace não encontrado</h1>
          <Button asChild className="mt-6">
            <Link to="/">Voltar</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const canEdit = canEditWorkspace(workspace, profile.id);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creating || !title.trim()) return;
    setCreating(true);
    try {
      const board = await createWhiteboard(workspaceId, title);
      if (board) {
        setTitle("");
        void navigate({
          to: "/workspace/$workspaceId/whiteboards/$whiteboardId",
          params: { workspaceId, whiteboardId: board.id },
        });
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-10">
        <Link
          to="/workspace/$workspaceId"
          params={{ workspaceId }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" /> {workspace.name}
        </Link>
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Quadros
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <PenTool className="h-6 w-6" /> Desenho livre
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rascunhos, diagramas e ideias à mão livre — com toque e caneta no iPad.
          </p>
        </div>

        {!canEdit && <ReadOnlyNotice />}

        {canEdit && (
          <form onSubmit={submit} className="mt-6 flex max-w-md gap-2">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, 80))}
              placeholder="Nome do novo quadro"
              maxLength={80}
            />
            <Button type="submit" className="shrink-0 gap-2" disabled={creating || !title.trim()}>
              <Plus className="h-4 w-4" /> Criar
            </Button>
          </form>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {whiteboards.length === 0 && (
            <p className="col-span-full rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum quadro neste projeto ainda.
            </p>
          )}
          {whiteboards.map((board) => (
            <Card key={board.id} className="group flex flex-col gap-2 p-4">
              <Link
                to="/workspace/$workspaceId/whiteboards/$whiteboardId"
                params={{ workspaceId, whiteboardId: board.id }}
                className="flex-1"
              >
                <p className="truncate text-sm font-medium group-hover:underline">{board.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Editado {formatDistanceToNow(new Date(board.updatedAt), { locale: ptBR })} atrás
                </p>
              </Link>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <input
                    className="min-w-0 flex-1 rounded bg-transparent px-1 text-xs text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40"
                    defaultValue={board.title}
                    maxLength={80}
                    aria-label={`Renomear ${board.title}`}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next && next !== board.title) {
                        renameWhiteboard(workspaceId, board.id, next);
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    aria-label={`Excluir ${board.title}`}
                    onClick={() => deleteWhiteboard(workspaceId, board.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
