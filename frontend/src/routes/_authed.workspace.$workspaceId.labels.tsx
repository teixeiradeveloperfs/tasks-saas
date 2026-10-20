import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ReadOnlyNotice } from "@/components/read-only-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { canEditWorkspace } from "@/lib/workspace-access";
import { LABEL_COLORS, useProfile, useStore } from "@/state/workspace-store";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/labels")({
  component: LabelsView,
});

const MAX_NAME = 24;

function LabelsView() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const profile = useProfile();
  const tasks = useStore((s) => s.tasks);
  const createLabel = useStore((s) => s.createLabel);
  const renameLabel = useStore((s) => s.renameLabel);
  const updateLabelColor = useStore((s) => s.updateLabelColor);
  const deleteLabel = useStore((s) => s.deleteLabel);

  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const usage = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tasks) {
      if (t.workspaceId !== workspaceId) continue;
      for (const l of t.labels) map[l] = (map[l] ?? 0) + 1;
    }
    return map;
  }, [tasks, workspaceId]);

  if (!workspace) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16 text-center">
          <h1 className="text-xl font-semibold">Workspace não encontrado</h1>
          <Button asChild className="mt-6">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </AppShell>
    );
  }
  const canEdit = canEditWorkspace(workspace, profile.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe um nome.");
      return;
    }
    if (workspace.labels.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) {
      setError("Já existe uma etiqueta com este nome.");
      return;
    }
    const created = await createLabel(workspaceId, trimmed, color);
    if (!created) {
      setError("Não foi possível criar a etiqueta.");
      return;
    }
    setName("");
    setError(null);
  };

  const commitRename = () => {
    if (!editing) return;
    const trimmed = editing.name.trim();
    if (trimmed) renameLabel(workspaceId, editing.id, trimmed);
    setEditing(null);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            to="/workspace/$workspaceId"
            params={{ workspaceId }}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {workspace.name}
          </Link>
          <span>/</span>
          <span className="text-foreground">Etiquetas</span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-md text-white"
            style={{ backgroundColor: workspace.color }}
          >
            <Tag className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Etiquetas</h1>
            <p className="text-sm text-muted-foreground">
              Padronize categorias reutilizáveis nas tarefas deste workspace.
            </p>
          </div>
        </div>

        {!canEdit && <ReadOnlyNotice />}
        {canEdit && (
          <Card className="mt-6 p-5">
            <form onSubmit={submit} className="space-y-3">
              <Label htmlFor="lbl-name">Nova etiqueta</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="lbl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
                  placeholder="Ex: bug, marketing, cliente-A"
                  maxLength={MAX_NAME}
                  className="flex-1"
                />
                <Button type="submit" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Cor:</span>
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Cor ${c}`}
                    className={cn(
                      "h-6 w-6 rounded-full ring-offset-2 transition",
                      color === c && "ring-2 ring-foreground",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              {error && (
                <p className="text-xs text-destructive" role="alert">
                  {error}
                </p>
              )}
            </form>
          </Card>
        )}

        <div className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            {workspace.labels.length} etiqueta{workspace.labels.length === 1 ? "" : "s"}
          </h2>

          {workspace.labels.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 border-dashed p-10 text-center">
              <div className="rounded-full bg-muted p-3">
                <Tag className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Nenhuma etiqueta ainda. Crie a primeira acima.
              </p>
            </Card>
          ) : (
            <Card className="divide-y">
              {workspace.labels.map((l) => {
                const isEditing = editing?.id === l.id;
                const count = usage[l.name] ?? 0;
                return (
                  <div key={l.id} className="flex items-center gap-3 p-3">
                    <div className="relative">
                      <span
                        className="block h-5 w-5 rounded-full"
                        style={{ backgroundColor: l.color }}
                      />
                      <input
                        disabled={!canEdit}
                        type="color"
                        value={l.color}
                        onChange={(e) => updateLabelColor(workspaceId, l.id, e.target.value)}
                        className="absolute inset-0 h-5 w-5 cursor-pointer opacity-0"
                        aria-label={`Cor de ${l.name}`}
                      />
                    </div>

                    {isEditing ? (
                      <Input
                        autoFocus
                        value={editing!.name}
                        onChange={(e) =>
                          setEditing({ id: l.id, name: e.target.value.slice(0, MAX_NAME) })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename();
                          } else if (e.key === "Escape") {
                            setEditing(null);
                          }
                        }}
                        onBlur={commitRename}
                        maxLength={MAX_NAME}
                        className="h-8 max-w-xs"
                      />
                    ) : (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: l.color }}
                      >
                        {l.name}
                      </span>
                    )}

                    <span className="ml-1 text-xs text-muted-foreground">
                      {count} tarefa{count === 1 ? "" : "s"}
                    </span>

                    {canEdit && (
                      <div className="ml-auto flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={commitRename}
                              aria-label="Confirmar"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setEditing(null)}
                              aria-label="Cancelar"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setEditing({ id: l.id, name: l.name })}
                              aria-label="Renomear"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                if (
                                  count === 0 ||
                                  confirm(
                                    `Remover "${l.name}"? Ela será retirada de ${count} tarefa(s).`,
                                  )
                                ) {
                                  deleteLabel(workspaceId, l.id);
                                }
                              }}
                              aria-label="Excluir"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
