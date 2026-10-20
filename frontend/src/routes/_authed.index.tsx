import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Plus,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { format, isToday, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppShell } from "@/components/app-shell";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { statusLabels, useProfile, useStore } from "@/state/workspace-store";

export const Route = createFileRoute("/_authed/")({
  head: () => ({
    meta: [
      { title: "Taskora — Gerencie tarefas de várias empresas" },
      {
        name: "description",
        content:
          "Uma plataforma minimalista para organizar tarefas em workspaces separados por cliente ou empresa.",
      },
      { property: "og:title", content: "Taskora" },
      {
        property: "og:description",
        content: "Kanban e listas para gerenciar tarefas em múltiplos workspaces.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const workspaces = useStore((s) => s.workspaces);
  const tasks = useStore((s) => s.tasks);
  const profile = useProfile();
  const [open, setOpen] = useState(false);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const overdue = tasks.filter(
      (t) => t.dueDate && isPast(new Date(t.dueDate)) && t.status !== "done",
    ).length;
    return { total, done, inProgress, overdue };
  }, [tasks]);

  const dueSoon = useMemo(() => {
    return tasks
      .filter((t) => t.dueDate && t.status !== "done")
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 5);
  }, [tasks]);

  const recent = useMemo(() => {
    return [...tasks]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [tasks]);

  const wsById = useMemo(() => Object.fromEntries(workspaces.map((w) => [w.id, w])), [workspaces]);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Início
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Olá, {profile.name.split(" ")[0]}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Aqui está um resumo do que está acontecendo nos seus workspaces.
            </p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo workspace
          </Button>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Tarefas totais"
            value={stats.total}
            icon={<Circle className="h-4 w-4" />}
          />
          <StatCard
            label="Em progresso"
            value={stats.inProgress}
            icon={<Loader2 className="h-4 w-4" />}
            tone="progress"
          />
          <StatCard
            label="Concluídas"
            value={stats.done}
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="done"
          />
          <StatCard
            label="Atrasadas"
            value={stats.overdue}
            icon={<Clock className="h-4 w-4" />}
            tone="warn"
          />
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Prazos próximos</h2>
              <Link
                to="/calendar"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Ver reuniões <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-4 divide-y">
              {dueSoon.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma tarefa com prazo definido.
                </p>
              )}
              {dueSoon.map((t) => {
                const ws = wsById[t.workspaceId];
                const due = new Date(t.dueDate!);
                const overdue = isPast(due) && !isToday(due);
                return (
                  <Link
                    key={t.id}
                    to="/workspace/$workspaceId/board"
                    params={{ workspaceId: t.workspaceId }}
                    className="flex items-center gap-3 py-3 hover:bg-muted/40"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: ws?.color ?? "#94a3b8" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ws?.name ?? "Workspace"} · {statusLabels[t.status]}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        overdue ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {isToday(due) ? "Hoje" : format(due, "d MMM", { locale: ptBR })}
                    </span>
                  </Link>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold">Atividade recente</h2>
            <div className="mt-4 space-y-3">
              {recent.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem atividade ainda.</p>
              )}
              {recent.map((t) => {
                const ws = wsById[t.workspaceId];
                return (
                  <div key={t.id} className="flex items-start gap-2">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: ws?.color ?? "#94a3b8" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {ws?.name ?? "—"} ·{" "}
                        {format(new Date(t.createdAt), "d MMM", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Seus workspaces</h2>
            <span className="text-xs text-muted-foreground">
              {workspaces.length} {workspaces.length === 1 ? "workspace" : "workspaces"}
            </span>
          </div>
          {workspaces.length === 0 ? (
            <Card className="flex flex-col items-center justify-center gap-3 border-dashed p-12 text-center">
              <div className="rounded-full bg-muted p-3">
                <Plus className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-medium">Nenhum workspace ainda</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crie o primeiro para começar a organizar suas tarefas.
                </p>
              </div>
              <Button onClick={() => setOpen(true)} className="mt-2">
                Criar workspace
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {workspaces.map((ws) => {
                const wsTasks = tasks.filter((t) => t.workspaceId === ws.id);
                const todo = wsTasks.filter((t) => t.status === "todo").length;
                const doing = wsTasks.filter((t) => t.status === "in_progress").length;
                const done = wsTasks.filter((t) => t.status === "done").length;
                return (
                  <Link
                    key={ws.id}
                    to="/workspace/$workspaceId"
                    params={{ workspaceId: ws.id }}
                    className="group"
                  >
                    <Card className="h-full border p-5 transition hover:border-foreground/20 hover:shadow-sm">
                      <div className="flex items-center gap-3">
                        <WorkspaceAvatar workspace={ws} className="h-9 w-9 rounded-md text-sm" />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-medium">{ws.name}</h3>
                          <p className="truncate text-xs text-muted-foreground">
                            {ws.description || `${wsTasks.length} tarefas`}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                      </div>
                      <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-1">
                            <Circle className="h-3 w-3" />
                            {todo}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3 w-3" />
                            {doing}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {done}
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {ws.members.length}
                        </span>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <WorkspaceDialog open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "progress" | "done" | "warn";
}) {
  const toneClass =
    tone === "progress"
      ? "text-status-progress"
      : tone === "done"
        ? "text-status-done"
        : tone === "warn"
          ? "text-destructive"
          : "text-muted-foreground";
  return (
    <Card className="p-4">
      <div className={cn("flex items-center gap-2", toneClass)}>
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}

// Silence unused import warning: CalendarDays is used in the icon set above.
void CalendarDays;
