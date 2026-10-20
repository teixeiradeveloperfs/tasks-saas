import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarIcon, ChevronLeft, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppShell } from "@/components/app-shell";
import { ReadOnlyNotice } from "@/components/read-only-notice";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { canEditWorkspace } from "@/lib/workspace-access";
import { useProfile, useStore } from "@/state/workspace-store";
import { belongsToProject, useActiveProject } from "@/state/use-active-project";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/goals")({
  component: GoalsPage,
});

function GoalsPage() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const { projectId: activeProjectId } = useActiveProject(workspaceId);
  const profile = useProfile();
  const allTasks = useStore((s) => s.tasks);
  const createGoal = useStore((s) => s.createGoal);
  const updateGoal = useStore((s) => s.updateGoal);
  const deleteGoal = useStore((s) => s.deleteGoal);
  const toggleGoalTask = useStore((s) => s.toggleGoalTask);
  const toggleGoalSprint = useStore((s) => s.toggleGoalSprint);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [error, setError] = useState<string | null>(null);

  const tasks = useMemo(
    () =>
      allTasks.filter(
        (t) => t.workspaceId === workspaceId && belongsToProject(t.projectId, activeProjectId),
      ),
    [activeProjectId, allTasks, workspaceId],
  );
  const taskById = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks]);
  const sprintById = useMemo(
    () => Object.fromEntries((workspace?.sprints ?? []).map((s) => [s.id, s])),
    [workspace?.sprints],
  );

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
    const created = await createGoal(workspaceId, {
      name,
      description,
      dueDate: dueDate?.toISOString(),
    });
    if (!created) {
      setError("Não foi possível criar.");
      return;
    }
    setName("");
    setDescription("");
    setDueDate(undefined);
  };

  const computeProgress = (goalTaskIds: string[], goalSprintIds: string[]) => {
    const linkedTasks = new Set<string>();
    for (const id of goalTaskIds) if (taskById[id]) linkedTasks.add(id);
    for (const sid of goalSprintIds) {
      for (const t of tasks) if (t.sprintId === sid) linkedTasks.add(t.id);
    }
    const total = linkedTasks.size;
    let done = 0;
    for (const id of linkedTasks) if (taskById[id]?.status === "done") done += 1;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
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
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Metas
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Target className="h-6 w-6" /> Metas do workspace
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Objetivos maiores que agregam tarefas e sprints, com progresso automático.
          </p>
        </div>

        {!canEdit && <ReadOnlyNotice />}
        {canEdit && (
          <Card className="mt-6 p-5">
            <h2 className="text-sm font-semibold">Nova meta</h2>
            <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="g-name">Nome</Label>
                <Input
                  id="g-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 80))}
                  placeholder="Ex.: Lançar release v1.3"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="g-desc">Descrição</Label>
                <Textarea
                  id="g-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 300))}
                  rows={2}
                  placeholder="O que compõe essa meta?"
                />
              </div>
              <div className="space-y-2">
                <Label>Prazo</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn("w-full justify-start", !dueDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {dueDate ? format(dueDate, "d MMM yyyy", { locale: ptBR }) : "Sem prazo"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              {error && <p className="text-xs text-destructive sm:col-span-2">{error}</p>}
              <div className="sm:col-span-2">
                <Button type="submit" className="gap-2">
                  <Plus className="h-4 w-4" /> Criar meta
                </Button>
              </div>
            </form>
          </Card>
        )}

        <div className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold">
            Metas (
            {workspace.goals.filter((g) => belongsToProject(g.projectId, activeProjectId)).length})
          </h2>
          {workspace.goals.filter((g) => belongsToProject(g.projectId, activeProjectId)).length ===
            0 && (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma meta ainda.
            </p>
          )}
          {workspace.goals
            .filter((g) => belongsToProject(g.projectId, activeProjectId))
            .map((g) => {
              const p = computeProgress(g.taskIds, g.sprintIds);
              return (
                <Card key={g.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <input
                        readOnly={!canEdit}
                        className="w-full bg-transparent text-base font-semibold outline-none focus:ring-1 focus:ring-primary/40 rounded px-1"
                        defaultValue={g.name}
                        maxLength={80}
                        onBlur={(event) => {
                          if (!canEdit) return;
                          const name = event.target.value.trim();
                          if (name && name !== g.name) updateGoal(workspaceId, g.id, { name });
                        }}
                      />
                      <textarea
                        readOnly={!canEdit}
                        className="mt-1 w-full resize-none bg-transparent text-sm text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40 rounded px-1"
                        rows={2}
                        defaultValue={g.description ?? ""}
                        maxLength={300}
                        onBlur={(event) => {
                          if (!canEdit) return;
                          const description = event.target.value.trim();
                          if (description !== (g.description ?? "")) {
                            updateGoal(workspaceId, g.id, { description });
                          }
                        }}
                        placeholder="Descrição…"
                      />
                    </div>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => deleteGoal(workspaceId, g.id)}
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    {g.dueDate && (
                      <span>
                        Prazo: {format(new Date(g.dueDate), "d MMM yyyy", { locale: ptBR })}
                      </span>
                    )}
                    <span className="ml-auto">
                      {p.done}/{p.total} · {p.pct}%
                    </span>
                  </div>
                  <Progress value={p.pct} className="mt-2 h-1.5" />

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-xs font-medium">Sprints incluídas</p>
                      <div className="space-y-1">
                        {workspace.sprints.filter((sp) =>
                          belongsToProject(sp.projectId, activeProjectId),
                        ).length === 0 && (
                          <p className="text-xs text-muted-foreground">Nenhum sprint.</p>
                        )}
                        {workspace.sprints
                          .filter((sp) => belongsToProject(sp.projectId, activeProjectId))
                          .map((sp) => (
                            <label key={sp.id} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={g.sprintIds.includes(sp.id)}
                                disabled={!canEdit}
                                onCheckedChange={() => toggleGoalSprint(workspaceId, g.id, sp.id)}
                              />
                              <Sparkles className="h-3 w-3 text-primary" />
                              <span className="truncate">{sp.name}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-medium">Tarefas vinculadas</p>
                      <div className="max-h-40 space-y-1 overflow-auto pr-1">
                        {tasks.length === 0 && (
                          <p className="text-xs text-muted-foreground">Sem tarefas.</p>
                        )}
                        {tasks.map((t) => {
                          const includedViaSprint = t.sprintId && g.sprintIds.includes(t.sprintId);
                          return (
                            <label key={t.id} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={g.taskIds.includes(t.id) || !!includedViaSprint}
                                disabled={!canEdit || !!includedViaSprint}
                                onCheckedChange={() => toggleGoalTask(workspaceId, g.id, t.id)}
                              />
                              <span
                                className={cn(
                                  "truncate",
                                  t.status === "done" && "text-muted-foreground line-through",
                                )}
                              >
                                {t.title}
                              </span>
                              {includedViaSprint && sprintById[t.sprintId!] && (
                                <span className="ml-auto text-[10px] text-muted-foreground">
                                  via sprint
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
        </div>
      </div>
    </AppShell>
  );
}
