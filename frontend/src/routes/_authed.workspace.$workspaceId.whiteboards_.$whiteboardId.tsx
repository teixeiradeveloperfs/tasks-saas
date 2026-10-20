import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { readWhiteboard, updateWhiteboard } from "@/lib/api/workspace";
import { canEditWorkspace } from "@/lib/workspace-access";
import { useProfile, useStore } from "@/state/workspace-store";

// O Excalidraw pesa mais de 1 MB; só quem abre um quadro paga esse carregamento.
const WhiteboardEditor = lazy(() =>
  import("@/components/whiteboard-editor").then((module) => ({
    default: module.WhiteboardEditor,
  })),
);

export const Route = createFileRoute("/_authed/workspace/$workspaceId/whiteboards_/$whiteboardId")({
  component: WhiteboardEditorPage,
});

type SaveState = "saved" | "saving" | "error";

function WhiteboardEditorPage() {
  const { workspaceId, whiteboardId } = Route.useParams();
  const workspace = useStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const profile = useProfile();

  const [board, setBoard] = useState<{ title: string; scene: string } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  // Salvamentos são serializados: se um novo traço chega enquanto o PATCH anterior
  // voa, guarda-se a cena mais recente e envia-se ao terminar — nunca em paralelo,
  // para a última escrita ser de fato a mais nova.
  const inFlightRef = useRef(false);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setBoard(null);
    setLoadError(false);
    readWhiteboard({ data: { id: whiteboardId } })
      .then((data) => {
        if (mounted) setBoard({ title: data.title, scene: data.scene });
      })
      .catch(() => {
        if (mounted) setLoadError(true);
      });
    return () => {
      mounted = false;
    };
  }, [whiteboardId]);

  const persist = useCallback(
    (scene: string) => {
      if (inFlightRef.current) {
        pendingRef.current = scene;
        return;
      }
      inFlightRef.current = true;
      setSaveState("saving");
      updateWhiteboard({ data: { id: whiteboardId, patch: { scene } } })
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"))
        .finally(() => {
          inFlightRef.current = false;
          if (pendingRef.current !== null) {
            const next = pendingRef.current;
            pendingRef.current = null;
            persist(next);
          }
        });
    },
    [whiteboardId],
  );

  const canEdit = workspace ? canEditWorkspace(workspace, profile.id) : false;

  return (
    <AppShell>
      <div className="flex h-[calc(100dvh-4rem)] flex-col">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/workspace/$workspaceId/whiteboards"
              params={{ workspaceId }}
              className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" /> Quadros
            </Link>
            <span className="truncate text-sm font-medium">{board?.title ?? "…"}</span>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {saveState === "saving" && "Salvando…"}
            {saveState === "saved" && canEdit && "Salvo"}
            {saveState === "error" && (
              <span className="text-destructive">Falha ao salvar — verifique a conexão</span>
            )}
            {!canEdit && "Somente leitura"}
          </span>
        </div>

        <div className="min-h-0 flex-1">
          {loadError ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <p className="text-sm text-muted-foreground">
                Este quadro não foi encontrado ou você não tem acesso a ele.
              </p>
              <Button asChild variant="outline">
                <Link to="/workspace/$workspaceId/whiteboards" params={{ workspaceId }}>
                  Voltar aos quadros
                </Link>
              </Button>
            </div>
          ) : board === null ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <WhiteboardEditor
                initialScene={board.scene}
                onPersist={persist}
                readOnly={!canEdit}
              />
            </Suspense>
          )}
        </div>
      </div>
    </AppShell>
  );
}
