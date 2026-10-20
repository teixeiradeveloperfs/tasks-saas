import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarIcon, ChevronLeft, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppShell } from "@/components/app-shell";
import { ReadOnlyNotice } from "@/components/read-only-notice";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { canEditWorkspace } from "@/lib/workspace-access";
import { useProfile, useStore, type Sprint } from "@/state/workspace-store";
import { belongsToProject, useActiveProject } from "@/state/use-active-project";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/sprints")({
  component: SprintsPage,
});

function SprintsPage() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const { projectId: activeProjectId } = useActiveProject(workspaceId);
  const profile = useProfile();
  const tasks = useStore((s) => s.tasks);
  const createSprint = useStore((s) => s.createSprint);
  const updateSprint = useStore((s) => s.updateSprint);
  const deleteSprint = useStore((s) => s.deleteSprint);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [error, setError] = useState<string | null>(null);

  const statsBySprint = useMemo(() => {
    const map: Record<string, { total: number; done: number }> = {};
    for (const t of tasks) {
      if (
        t.workspaceId !== workspaceId ||
        !belongsToProject(t.projectId, activeProjectId) ||
        !t.sprintId
      )
        continue;
      const s = (map[t.sprintId] ??= { total: 0, done: 0 });
      s.total += 1;
      if (t.status === "done") s.done += 1;
    }
    return map;
  }, [activeProjectId, tasks, workspaceId]);

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
    const created = await createSprint(workspaceId, {
      name,
      goal,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
    });
    if (!created) {
      setError("Não foi possível criar.");
      return;
    }
    setName("");
    setGoal("");
    setStartDate(undefined);
    setEndDate(undefined);
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
            Sprints
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sprints e metas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agrupe tarefas em ciclos com objetivo, prazo e progresso.
          </p>
        </div>

        {!canEdit && <ReadOnlyNotice />}
        {canEdit && (
          <Card className="mt-8 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4" /> Novo sprint
            </h2>
            <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sp-name">Nome</Label>
                <Input
                  id="sp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 60))}
                  placeholder="Ex.: Sprint 13"
                  maxLength={60}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sp-goal">Meta / objetivo</Label>
                <Textarea
                  id="sp-goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value.slice(0, 240))}
                  rows={2}
                  placeholder="O que precisa ser entregue neste ciclo?"
                  maxLength={240}
                />
              </div>
              <div className="space-y-2">
                <Label>Início</Label>
                <DateBtn value={startDate} onChange={setStartDate} label="Início" />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <DateBtn value={endDate} onChange={setEndDate} label="Fim" />
              </div>
              {error && <p className="text-xs text-destructive sm:col-span-2">{error}</p>}
              <div className="sm:col-span-2">
                <Button type="submit" className="gap-2">
                  <Plus className="h-4 w-4" /> Criar sprint
                </Button>
              </div>
            </form>
          </Card>
        )}

        <div className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold">
            Sprints (
            {
              workspace.sprints.filter((sp) => belongsToProject(sp.projectId, activeProjectId))
                .length
            }
            )
          </h2>
          {workspace.sprints.filter((sp) => belongsToProject(sp.projectId, activeProjectId))
            .length === 0 && (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum sprint ainda.
            </p>
          )}
          {workspace.sprints
            .filter((sp) => belongsToProject(sp.projectId, activeProjectId))
            .map((sp) => {
              const stats = statsBySprint[sp.id] ?? { total: 0, done: 0 };
              const progress = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
              return (
                <Card key={sp.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <input
                        readOnly={!canEdit}
                        className="w-full bg-transparent text-base font-semibold outline-none focus:ring-1 focus:ring-primary/40 rounded px-1"
                        defaultValue={sp.name}
                        maxLength={60}
                        onBlur={(event) => {
                          if (!canEdit) return;
                          const name = event.target.value.trim();
                          if (name && name !== sp.name) updateSprint(workspaceId, sp.id, { name });
                        }}
                      />
                      <textarea
                        readOnly={!canEdit}
                        className="mt-1 w-full resize-none bg-transparent text-sm text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40 rounded px-1"
                        rows={1}
                        defaultValue={sp.goal ?? ""}
                        maxLength={240}
                        onBlur={(event) => {
                          if (!canEdit) return;
                          const goal = event.target.value.trim();
                          if (goal !== (sp.goal ?? "")) updateSprint(workspaceId, sp.id, { goal });
                        }}
                        placeholder="Meta…"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        disabled={!canEdit}
                        value={sp.status}
                        onValueChange={(v) =>
                          updateSprint(workspaceId, sp.id, {
                            status: v as Sprint["status"],
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-[120px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planned">Planejado</SelectItem>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="closed">Encerrado</SelectItem>
                        </SelectContent>
                      </Select>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => deleteSprint(workspaceId, sp.id)}
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {sp.startDate && (
                      <span>
                        Início: {format(new Date(sp.startDate), "d MMM", { locale: ptBR })}
                      </span>
                    )}
                    {sp.endDate && (
                      <span>Fim: {format(new Date(sp.endDate), "d MMM", { locale: ptBR })}</span>
                    )}
                    <span className="ml-auto">
                      {stats.done}/{stats.total} tarefas
                    </span>
                  </div>
                  <Progress value={progress} className="mt-2 h-1.5" />
                </Card>
              );
            })}
        </div>
      </div>
    </AppShell>
  );
}

function DateBtn({
  value,
  onChange,
  label,
}: {
  value?: Date;
  onChange: (d: Date | undefined) => void;
  label: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {value ? format(value, "d MMM yyyy", { locale: ptBR }) : `Sem ${label.toLowerCase()}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} initialFocus />
        {value && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => onChange(undefined)}
            >
              Limpar
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
