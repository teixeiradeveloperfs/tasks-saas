import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, History, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppShell } from "@/components/app-shell";
import { ReadOnlyNotice } from "@/components/read-only-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listAudit, undoAudit, type AuditPage } from "@/lib/api/audit";
import { getBoardData } from "@/lib/api/board";
import { canEditWorkspace } from "@/lib/workspace-access";
import { getDataRevision, useProfile, useStore, type AuditEvent } from "@/state/workspace-store";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/audit")({
  component: AuditPageView,
});

function AuditPageView() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const profile = useProfile();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [undoing, setUndoing] = useState<string>();

  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      try {
        const page: AuditPage = await listAudit(workspaceId, cursor);
        setEvents((current) => (cursor ? [...current, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (!workspace) {
    return (
      <AppShell>
        <div className="px-4 py-12 sm:px-6 sm:py-16 text-center">Workspace não encontrado.</div>
      </AppShell>
    );
  }
  const canEdit = canEditWorkspace(workspace, profile.id);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-8">
        <Link
          to="/workspace/$workspaceId"
          params={{ workspaceId }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" /> {workspace.name}
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <History className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-semibold">Auditoria</h1>
            <p className="text-sm text-muted-foreground">
              Ações registradas com autor, data e recurso afetado.
            </p>
          </div>
        </div>
        {!canEdit && <ReadOnlyNotice />}

        <Card className="mt-6 divide-y">
          {!loading && events.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma ação registrada.
            </p>
          )}
          {events.map((event) => (
            <div key={event.id} className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{event.actor}</span>{" "}
                  <span className="text-muted-foreground">{event.summary}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {format(new Date(event.createdAt), "d 'de' MMM, HH:mm", { locale: ptBR })}
                </p>
              </div>
              {event.undoable && canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={undoing === event.id}
                  onClick={async () => {
                    setUndoing(event.id);
                    try {
                      await undoAudit(event.id);
                      const board = await getBoardData();
                      useStore.getState().hydrateFromServer(board, getDataRevision());
                      await load();
                    } finally {
                      setUndoing(undefined);
                    }
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Desfazer
                </Button>
              )}
            </div>
          ))}
        </Card>
        {nextCursor && (
          <Button
            variant="outline"
            className="mt-4"
            disabled={loading}
            onClick={() => load(nextCursor)}
          >
            {loading ? "Carregando…" : "Carregar mais"}
          </Button>
        )}
      </div>
    </AppShell>
  );
}
