import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ClipboardList, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ReadOnlyNotice } from "@/components/read-only-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { canEditWorkspace } from "@/lib/workspace-access";
import { useProfile, useStore, type CustomFieldType } from "@/state/workspace-store";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/fields")({
  component: FieldsPage,
});

function FieldsPage() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const profile = useProfile();
  const createCustomField = useStore((s) => s.createCustomField);
  const updateCustomField = useStore((s) => s.updateCustomField);
  const deleteCustomField = useStore((s) => s.deleteCustomField);

  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [optionsRaw, setOptionsRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

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
  const canEdit = canEditWorkspace(workspace, profile.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe um nome.");
      return;
    }
    const options =
      type === "select"
        ? optionsRaw
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : undefined;
    if (type === "select" && (!options || options.length === 0)) {
      setError("Informe pelo menos uma opção (separadas por vírgula).");
      return;
    }
    const created = await createCustomField(workspaceId, { name, type, options });
    if (!created) {
      setError("Não foi possível criar.");
      return;
    }
    setName("");
    setType("text");
    setOptionsRaw("");
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
            Campos personalizados
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Campos do workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Adicione campos extras às tarefas — texto, número ou lista de opções.
          </p>
        </div>

        {!canEdit && <ReadOnlyNotice />}
        {canEdit && (
          <Card className="mt-8 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4" /> Novo campo
            </h2>
            <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="f-name">Nome</Label>
                <Input
                  id="f-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 40))}
                  placeholder="Ex.: Story points"
                  maxLength={40}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as CustomFieldType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="select">Lista de opções</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {type === "select" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="f-opts">Opções (separadas por vírgula)</Label>
                  <Input
                    id="f-opts"
                    value={optionsRaw}
                    onChange={(e) => setOptionsRaw(e.target.value)}
                    placeholder="Baixo, Médio, Alto"
                  />
                </div>
              )}
              {error && <p className="text-xs text-destructive sm:col-span-2">{error}</p>}
              <div className="sm:col-span-2">
                <Button type="submit" className="gap-2">
                  <Plus className="h-4 w-4" /> Criar campo
                </Button>
              </div>
            </form>
          </Card>
        )}

        <div className="mt-8 space-y-2">
          <h2 className="text-sm font-semibold">Campos ({workspace.customFields.length})</h2>
          {workspace.customFields.length === 0 && (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum campo ainda.
            </p>
          )}
          {workspace.customFields.map((f) => (
            <Card key={f.id} className="flex items-start gap-3 p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  readOnly={!canEdit}
                  className="w-full bg-transparent text-sm font-medium outline-none focus:ring-1 focus:ring-primary/40 rounded px-1"
                  defaultValue={f.name}
                  maxLength={40}
                  onBlur={(event) => {
                    if (!canEdit) return;
                    const name = event.target.value.trim();
                    if (name && name !== f.name) updateCustomField(workspaceId, f.id, { name });
                  }}
                />
                <p className="px-1 text-xs text-muted-foreground capitalize">
                  {f.type === "select"
                    ? "Lista de opções"
                    : f.type === "number"
                      ? "Número"
                      : "Texto"}
                </p>
                {f.type === "select" && (
                  <div className="flex flex-wrap gap-1 px-1">
                    {(f.options ?? []).map((o) => (
                      <span
                        key={o}
                        className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px]"
                      >
                        {o}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() =>
                              updateCustomField(workspaceId, f.id, {
                                options: (f.options ?? []).filter((x) => x !== o),
                              })
                            }
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={`Remover ${o}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                    {canEdit && (
                      <AddOption
                        onAdd={(v) =>
                          updateCustomField(workspaceId, f.id, {
                            options: Array.from(new Set([...(f.options ?? []), v])),
                          })
                        }
                      />
                    )}
                  </div>
                )}
              </div>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => deleteCustomField(workspaceId, f.id)}
                  aria-label="Excluir campo"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function AddOption({ onAdd }: { onAdd: (value: string) => void }) {
  const [v, setV] = useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={v}
        onChange={(e) => setV(e.target.value.slice(0, 30))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const t = v.trim();
            if (t) onAdd(t);
            setV("");
          }
        }}
        placeholder="+ opção"
        className="w-20 rounded border bg-background px-1.5 py-0.5 text-[11px] outline-none focus:ring-1 focus:ring-primary/40"
      />
    </span>
  );
}
