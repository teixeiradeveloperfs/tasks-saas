import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Clipboard,
  Copy,
  Pencil,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Star,
  TerminalSquare,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ReadOnlyNotice } from "@/components/read-only-notice";
import { RunbookDialog } from "@/components/runbook-dialog";
import { ShareDialog } from "@/components/share-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { canEditWorkspace, canManageWorkspace } from "@/lib/workspace-access";
import { belongsToProject, useActiveProject } from "@/state/use-active-project";
import { useProfile, useStore, type Runbook, type RunbookRisk } from "@/state/workspace-store";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/runbooks")({
  component: RunbooksPage,
});

const riskPresentation: Record<
  RunbookRisk,
  { label: string; className: string; icon: typeof ShieldCheck }
> = {
  safe: {
    label: "Seguro",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: ShieldCheck,
  },
  caution: {
    label: "Atenção",
    className: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    icon: AlertTriangle,
  },
  dangerous: {
    label: "Perigoso",
    className: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
    icon: AlertTriangle,
  },
};

function substituteVariables(command: string, runbook: Runbook, values: Record<string, string>) {
  return runbook.variables.reduce(
    (result, variable) =>
      result
        .split(`{{${variable.key}}}`)
        .join(values[variable.key] || variable.defaultValue || `{{${variable.key}}}`),
    command,
  );
}

async function copyCommand(command: string) {
  try {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = command;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("Clipboard indisponível");
    }
    toast.success("Comando copiado.");
  } catch {
    toast.error("Não foi possível copiar o comando.");
  }
}

function RunbooksPage() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const profile = useProfile();
  const { projectId: activeProjectId } = useActiveProject(workspaceId);
  const toggleFavorite = useStore((state) => state.toggleRunbookFavorite);
  const toggleStep = useStore((state) => state.toggleRunbookStep);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [shareOpen, setShareOpen] = useState(false);

  const projectRunbooks = useMemo(
    () =>
      workspace?.runbooks.filter((runbook) =>
        belongsToProject(runbook.projectId, activeProjectId),
      ) ?? [],
    [activeProjectId, workspace?.runbooks],
  );
  const categories = useMemo(
    () => [...new Set(projectRunbooks.map((runbook) => runbook.category))].sort(),
    [projectRunbooks],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return projectRunbooks.filter((runbook) => {
      if (category !== "all" && runbook.category !== category) return false;
      if (favoritesOnly && !runbook.favorite) return false;
      if (!term) return true;
      return [
        runbook.title,
        runbook.description,
        runbook.environment,
        runbook.category,
        ...runbook.tags,
        ...runbook.steps.flatMap((step) => [step.title, step.command, step.explanation]),
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [category, favoritesOnly, projectRunbooks, search]);

  useEffect(() => {
    if (!filtered.some((runbook) => runbook.id === selectedId)) setSelectedId(filtered[0]?.id);
  }, [filtered, selectedId]);

  const selected = projectRunbooks.find((runbook) => runbook.id === selectedId);
  const editing = projectRunbooks.find((runbook) => runbook.id === editingId);

  useEffect(() => {
    setVariableValues(
      Object.fromEntries(
        (selected?.variables ?? []).map((variable) => [variable.key, variable.defaultValue ?? ""]),
      ),
    );
  }, [selected?.id, selected?.updatedAt, selected?.variables]);

  if (!workspace) {
    return (
      <AppShell>
        <div className="px-4 py-12 text-center sm:px-6 sm:py-16">Workspace não encontrado.</div>
      </AppShell>
    );
  }

  const canEdit = canEditWorkspace(workspace, profile.id);
  const canShare = canManageWorkspace(workspace, profile.id);
  const completedSteps = selected?.steps.filter((step) => step.checked).length ?? 0;

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
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Operações
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <TerminalSquare className="h-6 w-6" /> Runbooks
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Comandos e procedimentos reutilizáveis para servidores, bancos, deploys e suporte.
            </p>
          </div>
          {canEdit && (
            <Button
              onClick={() => {
                setEditingId(undefined);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Novo runbook
            </Button>
          )}
        </div>
        {!canEdit && <ReadOnlyNotice />}

        <div className="mt-6 grid min-w-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Buscar comandos…"
              />
            </div>
            <div className="flex gap-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="min-w-0 flex-1">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {categories.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant={favoritesOnly ? "secondary" : "outline"}
                size="icon"
                onClick={() => setFavoritesOnly((current) => !current)}
                aria-label="Mostrar favoritos"
                title="Favoritos"
              >
                <Star className={cn("h-4 w-4", favoritesOnly && "fill-current text-primary")} />
              </Button>
            </div>

            <Card className="max-h-[60dvh] overflow-y-auto p-2 lg:max-h-[calc(100dvh-15rem)]">
              {filtered.length === 0 && (
                <div className="px-3 py-10 text-center">
                  <TerminalSquare className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-3 text-sm font-medium">Nenhum runbook encontrado</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ajuste os filtros ou cadastre o primeiro procedimento.
                  </p>
                </div>
              )}
              <div className="space-y-1">
                {filtered.map((runbook) => (
                  <button
                    key={runbook.id}
                    type="button"
                    onClick={() => setSelectedId(runbook.id)}
                    className={cn(
                      "w-full rounded-lg p-3 text-left transition hover:bg-accent",
                      selectedId === runbook.id && "bg-accent",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{runbook.title}</p>
                      {runbook.favorite && (
                        <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {runbook.environment} · {runbook.steps.length} etapa(s)
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {runbook.category}
                      </Badge>
                      {runbook.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </aside>

          <main className="min-w-0">
            {!selected ? (
              <Card className="flex min-h-80 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                Selecione ou crie um runbook para visualizar os comandos.
              </Card>
            ) : (
              <div className="space-y-4">
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{selected.category}</Badge>
                        <Badge variant="secondary">{selected.environment}</Badge>
                      </div>
                      <h2 className="mt-3 text-xl font-semibold">{selected.title}</h2>
                      {selected.description && (
                        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                          {selected.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {canShare && (
                        <Button type="button" variant="outline" onClick={() => setShareOpen(true)}>
                          <Share2 className="h-4 w-4" /> Compartilhar
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => void toggleFavorite(selected.id)}
                        aria-label={selected.favorite ? "Remover dos favoritos" : "Favoritar"}
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            selected.favorite && "fill-primary text-primary",
                          )}
                        />
                      </Button>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setEditingId(selected.id);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" /> Editar
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {completedSteps}/{selected.steps.length} etapas concluídas
                    </span>
                    {selected.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </Card>

                {selected.variables.length > 0 && (
                  <Card className="p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <Clipboard className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <h3 className="text-sm font-semibold">Valores para este uso</h3>
                        <p className="text-xs text-muted-foreground">
                          Estes valores não são salvos; são usados apenas ao copiar os comandos.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {selected.variables.map((variable) => (
                        <div key={variable.id} className="space-y-1.5">
                          <Label htmlFor={`variable-${variable.id}`} className="font-mono text-xs">
                            {variable.key}
                          </Label>
                          <Input
                            id={`variable-${variable.id}`}
                            value={variableValues[variable.key] ?? ""}
                            onChange={(event) =>
                              setVariableValues((current) => ({
                                ...current,
                                [variable.key]: event.target.value,
                              }))
                            }
                            placeholder={variable.defaultValue || "Informe o valor"}
                          />
                          {variable.description && (
                            <p className="text-[11px] text-muted-foreground">
                              {variable.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <div className="space-y-3">
                  {selected.steps.map((step, index) => {
                    const risk = riskPresentation[step.risk];
                    const RiskIcon = risk.icon;
                    const command = substituteVariables(step.command, selected, variableValues);
                    return (
                      <Card
                        key={step.id}
                        className={cn("overflow-hidden", step.checked && "opacity-70")}
                      >
                        <div className="flex items-start gap-3 p-4 sm:p-5">
                          <Checkbox
                            checked={step.checked}
                            disabled={!canEdit}
                            onCheckedChange={() => void toggleStep(step.id)}
                            aria-label={`Marcar etapa ${step.title}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Etapa {index + 1}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn("gap-1 text-[10px]", risk.className)}
                              >
                                <RiskIcon className="h-3 w-3" /> {risk.label}
                              </Badge>
                            </div>
                            <h3 className={cn("mt-1 font-medium", step.checked && "line-through")}>
                              {step.title}
                            </h3>
                            {step.explanation && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {step.explanation}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="relative border-y bg-slate-950 text-slate-100">
                          <pre className="max-w-full overflow-x-auto p-4 pr-14 text-xs leading-6">
                            <code>{command}</code>
                          </pre>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="absolute right-2 top-2 text-slate-300 hover:bg-white/10 hover:text-white"
                            onClick={() => void copyCommand(command)}
                            aria-label="Copiar comando"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        {step.expectedResult && (
                          <div className="flex gap-2 bg-muted/20 px-4 py-3 text-xs sm:px-5">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            <p>
                              <span className="font-medium">Resultado esperado:</span>{" "}
                              <span className="text-muted-foreground">{step.expectedResult}</span>
                            </p>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      <RunbookDialog
        workspaceId={workspaceId}
        projectId={activeProjectId}
        runbook={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      {selected && (
        <ShareDialog
          kind="runbook"
          itemId={selected.id}
          itemName={selected.title}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}
    </AppShell>
  );
}
