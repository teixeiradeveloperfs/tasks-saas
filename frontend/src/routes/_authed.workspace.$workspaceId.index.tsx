import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  Columns3,
  FileText,
  Plus,
  Rocket,
  Settings2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { format, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppShell } from "@/components/app-shell";
import { TaskDialog } from "@/components/task-dialog";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { canEditWorkspace, canManageWorkspace } from "@/lib/workspace-access";
import {
  priorityLabels,
  statusLabels,
  useStore,
  type Task,
  type TaskPriority,
} from "@/state/workspace-store";
import { belongsToProject, useActiveProject } from "@/state/use-active-project";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/")({
  component: WorkspaceOverview,
});

const priorityStyle: Record<TaskPriority, string> = {
  low: "text-muted-foreground",
  medium: "text-amber-600 dark:text-amber-400",
  high: "text-red-600 dark:text-red-400",
};

function WorkspaceOverview() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const { projectId: activeProjectId, project: activeProject } = useActiveProject(workspaceId);
  const profile = useStore((state) => state.profile);
  const allTasks = useStore((state) => state.tasks);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);

  const tasks = useMemo(
    () =>
      allTasks.filter(
        (task) =>
          task.workspaceId === workspaceId && belongsToProject(task.projectId, activeProjectId),
      ),
    [activeProjectId, allTasks, workspaceId],
  );
  const stats = useMemo(() => {
    const done = tasks.filter((task) => task.status === "done").length;
    const inProgress = tasks.filter((task) => task.status === "in_progress").length;
    const overdue = tasks.filter(
      (task) => task.dueDate && isPast(new Date(task.dueDate)) && task.status !== "done",
    ).length;
    return {
      total: tasks.length,
      done,
      inProgress,
      overdue,
      progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    };
  }, [tasks]);
  const recentTasks = useMemo(
    () =>
      [...tasks]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6),
    [tasks],
  );

  if (!workspace) {
    return (
      <AppShell>
        <div className="px-4 py-12 sm:px-6 sm:py-16 text-center">
          <h1 className="text-xl font-semibold">Workspace não encontrado</h1>
          <Button asChild className="mt-6">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const canEdit = canEditWorkspace(workspace, profile?.id);
  const canManage = canManageWorkspace(workspace, profile?.id);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <WorkspaceAvatar workspace={workspace} className="h-11 w-11 rounded-lg text-lg" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {activeProject ? `Projeto · ${activeProject.name}` : "Visão geral"}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
              <p className="text-sm text-muted-foreground">
                {workspace.description || "Acompanhe o trabalho deste workspace."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Button variant="outline" onClick={() => setWorkspaceDialogOpen(true)}>
                <Settings2 className="h-4 w-4" /> Editar workspace
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/workspace/$workspaceId/board" params={{ workspaceId }}>
                <Columns3 className="h-4 w-4" /> Abrir Board
              </Link>
            </Button>
            <Button onClick={() => setTaskDialogOpen(true)} disabled={!canEdit}>
              <Plus className="h-4 w-4" /> Nova tarefa
            </Button>
          </div>
        </div>

        {canManage && (
          <WorkspaceDialog
            open={workspaceDialogOpen}
            onOpenChange={setWorkspaceDialogOpen}
            workspace={workspace}
          />
        )}

        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Circle} label="Total de tarefas" value={stats.total} />
          <Metric icon={Clock3} label="Em andamento" value={stats.inProgress} />
          <Metric icon={CheckCircle2} label="Concluídas" value={stats.done} />
          <Metric icon={AlertTriangle} label="Atrasadas" value={stats.overdue} danger />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.7fr)]">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="font-semibold">Tarefas recentes</h2>
                <p className="text-xs text-muted-foreground">
                  Últimas tarefas adicionadas ao workspace.
                </p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/workspace/$workspaceId/board" params={{ workspaceId }}>
                  Ver todas <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
            <div className="divide-y">
              {recentTasks.length === 0 && (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  Nenhuma tarefa neste workspace.
                </div>
              )}
              {recentTasks.map((task) => (
                <RecentTask key={task.id} task={task} />
              ))}
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Progresso geral</h2>
                <span className="text-sm font-semibold">{stats.progress}%</span>
              </div>
              <Progress value={stats.progress} className="mt-4" />
              <p className="mt-3 text-xs text-muted-foreground">
                {stats.done} de {stats.total} tarefas concluídas.
              </p>
            </Card>

            <Card className="p-5">
              <h2 className="font-semibold">Acessos rápidos</h2>
              <div className="mt-3 grid gap-2">
                <QuickLink
                  icon={Rocket}
                  label={`${workspace.sprints.filter((item) => belongsToProject(item.projectId, activeProjectId)).length} sprints`}
                  to="/workspace/$workspaceId/sprints"
                  workspaceId={workspaceId}
                />
                <QuickLink
                  icon={FileText}
                  label={`${workspace.docs.filter((item) => belongsToProject(item.projectId, activeProjectId)).length} documentos`}
                  to="/workspace/$workspaceId/docs"
                  workspaceId={workspaceId}
                />
                <QuickLink
                  icon={Users}
                  label={`${workspace.members.length} membros`}
                  to="/workspace/$workspaceId/team"
                  workspaceId={workspaceId}
                />
                <QuickLink
                  icon={CalendarDays}
                  label="Ver reuniões"
                  to="/calendar"
                  workspaceId={workspaceId}
                />
              </div>
            </Card>
          </div>
        </div>
      </div>

      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        workspaceId={workspaceId}
        task={null}
        readOnly={!canEdit}
      />
    </AppShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  danger = false,
}: {
  icon: typeof Circle;
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <span
        className={cn(
          "rounded-lg bg-muted p-2.5",
          danger && value > 0 && "bg-destructive/10 text-destructive",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}

function RecentTask({ task }: { task: Task }) {
  return (
    <Link
      to="/workspace/$workspaceId/board"
      params={{ workspaceId: task.workspaceId }}
      className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-muted/40"
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          task.status === "done"
            ? "bg-emerald-500"
            : task.status === "in_progress"
              ? "bg-blue-500"
              : "bg-slate-400",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{task.title}</p>
        <p className="text-xs text-muted-foreground">{statusLabels[task.status]}</p>
      </div>
      <span className={cn("text-xs", priorityStyle[task.priority])}>
        {priorityLabels[task.priority]}
      </span>
      {task.dueDate && (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {format(new Date(task.dueDate), "d MMM", { locale: ptBR })}
        </span>
      )}
    </Link>
  );
}

function QuickLink({
  icon: Icon,
  label,
  to,
  workspaceId,
}: {
  icon: typeof Circle;
  label: string;
  to: string;
  workspaceId: string;
}) {
  return (
    <Button asChild variant="ghost" className="justify-start">
      <Link to={to} params={{ workspaceId }}>
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
        <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
      </Link>
    </Button>
  );
}
