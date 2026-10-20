import { Link, createFileRoute } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppShell } from "@/components/app-shell";
import { ReadOnlyNotice } from "@/components/read-only-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { canEditWorkspace } from "@/lib/workspace-access";
import { useProfile, useStore } from "@/state/workspace-store";
import { belongsToProject, useActiveProject } from "@/state/use-active-project";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/docs")({
  component: DocsPage,
});

function DocsPage() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const { projectId: activeProjectId } = useActiveProject(workspaceId);
  const docs = useMemo(
    () => workspace?.docs.filter((doc) => belongsToProject(doc.projectId, activeProjectId)) ?? [],
    [activeProjectId, workspace?.docs],
  );
  const profile = useProfile();
  const createDoc = useStore((s) => s.createDoc);
  const updateDoc = useStore((s) => s.updateDoc);
  const deleteDoc = useStore((s) => s.deleteDoc);

  const [selectedId, setSelectedId] = useState<string | null>(workspace?.docs[0]?.id ?? null);
  const selectedDoc = workspace?.docs.find((item) => item.id === selectedId);
  const [titleDraft, setTitleDraft] = useState(selectedDoc?.title ?? "");
  const [bodyDraft, setBodyDraft] = useState(selectedDoc?.body ?? "");

  useEffect(() => {
    if (!workspace) return;
    if (!selectedId && docs[0]) setSelectedId(docs[0].id);
    if (selectedId && !docs.some((d) => d.id === selectedId)) {
      setSelectedId(docs[0]?.id ?? null);
    }
  }, [docs, workspace, selectedId]);

  useEffect(() => {
    setTitleDraft(selectedDoc?.title ?? "");
    setBodyDraft(selectedDoc?.body ?? "");
  }, [selectedDoc?.id, selectedDoc?.title, selectedDoc?.body]);

  if (!workspace) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16 text-center">
          <h1 className="text-xl font-semibold">Workspace não encontrado</h1>
          <Button asChild className="mt-6">
            <Link to="/">Voltar</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const doc = docs.find((d) => d.id === selectedId) ?? null;
  const canEdit = canEditWorkspace(workspace, profile.id);

  const create = async () => {
    const d = await createDoc(workspaceId, "Sem título");
    if (d) setSelectedId(d.id);
  };

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
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Documentos
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <BookOpen className="h-6 w-6" /> Docs do workspace
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Notas, briefings e documentação por workspace.
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => void create()} className="gap-2">
              <Plus className="h-4 w-4" /> Novo doc
            </Button>
          )}
        </div>
        {!canEdit && <ReadOnlyNotice />}

        <div className="mt-6 grid gap-4 md:grid-cols-[240px_1fr]">
          <Card className="h-fit p-2">
            {docs.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">Nenhum documento ainda.</p>
            )}
            <ul className="space-y-0.5">
              {docs.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => setSelectedId(d.id)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-accent",
                      selectedId === d.id && "bg-accent font-medium",
                    )}
                  >
                    <span className="line-clamp-1">{d.title || "Sem título"}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {format(new Date(d.updatedAt), "d MMM, HH:mm", { locale: ptBR })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            {!doc ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Selecione ou crie um documento.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2">
                  <Input
                    readOnly={!canEdit}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value.slice(0, 80))}
                    onBlur={() => {
                      if (!canEdit) return;
                      const title = titleDraft.trim() || "Sem título";
                      if (title !== doc.title) updateDoc(workspaceId, doc.id, { title });
                    }}
                    placeholder="Título"
                    className="border-none bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
                  />
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => deleteDoc(workspaceId, doc.id)}
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Textarea
                  readOnly={!canEdit}
                  value={bodyDraft}
                  onChange={(event) => setBodyDraft(event.target.value.slice(0, 20000))}
                  onBlur={() => {
                    if (canEdit && bodyDraft !== doc.body) {
                      updateDoc(workspaceId, doc.id, { body: bodyDraft });
                    }
                  }}
                  rows={20}
                  placeholder="Escreva aqui… Markdown é bem-vindo."
                  className="min-h-[400px] resize-y font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Última edição:{" "}
                  {format(new Date(doc.updatedAt), "d MMM yyyy, HH:mm", { locale: ptBR })}
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
