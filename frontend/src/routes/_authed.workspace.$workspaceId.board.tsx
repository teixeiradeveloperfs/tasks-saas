import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Columns3,
  GanttChartSquare,
  List as ListIcon,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Sparkles,
  Tag,
  Target,
  Timer,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { differenceInCalendarDays, format, max, min } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppShell } from "@/components/app-shell";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { UserAvatar } from "@/components/user-avatar";
import { TaskDialog } from "@/components/task-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { canEditWorkspace } from "@/lib/workspace-access";
import {
  formatMinutes,
  priorityLabels,
  statusLabels,
  useStore,
  type Task,
  type BoardColumn,
  type TaskPriority,
  type TaskStatus,
} from "@/state/workspace-store";
import { belongsToProject, useActiveProject } from "@/state/use-active-project";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/board")({
  component: WorkspaceView,
});

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

const priorityStyles: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  high: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

const statusDot: Record<TaskStatus, string> = {
  todo: "bg-status-todo",
  in_progress: "bg-status-progress",
  done: "bg-status-done",
};

type ViewKind = "kanban" | "list" | "timeline";
type DueFilter = "all" | "overdue" | "today" | "week" | "none";

function WorkspaceView() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const { projectId: activeProjectId, project: activeProject } = useActiveProject(workspaceId);
  const allTasks = useStore((s) => s.tasks);
  const moveTask = useStore((s) => s.moveTask);
  const moveTaskToColumn = useStore((s) => s.moveTaskToColumn);
  const createBoardColumn = useStore((s) => s.createBoardColumn);
  const profile = useStore((s) => s.profile);
  const pageInfo = useStore((s) => s.taskPageInfo[workspaceId]);
  const loadMoreWorkspaceTasks = useStore((s) => s.loadMoreWorkspaceTasks);

  const wsAllTasks = useMemo(
    () =>
      allTasks.filter(
        (t) => t.workspaceId === workspaceId && belongsToProject(t.projectId, activeProjectId),
      ),
    [activeProjectId, allTasks, workspaceId],
  );

  const [view, setView] = useState<ViewKind>("kanban");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [sprintFilter, setSprintFilter] = useState<string>("all");
  const [labelFilter, setLabelFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [taskDialog, setTaskDialog] = useState<{
    open: boolean;
    task?: Task | null;
    defaultStatus?: TaskStatus;
    defaultBoardColumnId?: string;
  }>({ open: false });
  const [dragId, setDragId] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [columnName, setColumnName] = useState("");
  const [columnStatus, setColumnStatus] = useState<TaskStatus>("in_progress");

  const boardColumns = useMemo<BoardColumn[]>(() => {
    if (activeProject?.boardColumns?.length) {
      return [...activeProject.boardColumns].sort((a, b) => a.position - b.position);
    }
    return STATUSES.map((status, position) => ({
      id: `legacy-${status}`,
      projectId: activeProjectId ?? "",
      name: statusLabels[status],
      status,
      color: status === "done" ? "#22c55e" : status === "in_progress" ? "#0086f2" : "#94a3b8",
      position,
      createdAt: "",
    }));
  }, [activeProject?.boardColumns, activeProjectId]);

  const memberById = useMemo(() => {
    const m: Record<string, { name: string; color: string; avatarUrl?: string }> = {};
    for (const mem of workspace?.members ?? []) {
      m[mem.id] = { name: mem.name, color: mem.color, avatarUrl: mem.avatarUrl };
    }
    return m;
  }, [workspace?.members]);

  const sprintById = useMemo(() => {
    const m: Record<string, { name: string }> = {};
    for (const sp of workspace?.sprints ?? []) m[sp.id] = { name: sp.name };
    return m;
  }, [workspace?.sprints]);

  const labelColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const l of workspace?.labels ?? []) m[l.name] = l.color;
    return m;
  }, [workspace?.labels]);

  const blockedCount = useMemo(() => {
    const doneIds = new Set(wsAllTasks.filter((t) => t.status === "done").map((t) => t.id));
    const m: Record<string, number> = {};
    for (const t of wsAllTasks) {
      const count = t.blockedBy.filter((id) => !doneIds.has(id)).length;
      if (count) m[t.id] = count;
    }
    return m;
  }, [wsAllTasks]);

  const tasks = useMemo(() => {
    return wsAllTasks.filter((t) => {
      const taskAssigneeIds = t.assigneeIds ?? (t.assigneeId ? [t.assigneeId] : []);
      if (assigneeFilter === "none" && taskAssigneeIds.length) return false;
      if (
        assigneeFilter !== "all" &&
        assigneeFilter !== "none" &&
        !taskAssigneeIds.includes(assigneeFilter)
      )
        return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (sprintFilter === "none" && t.sprintId) return false;
      if (sprintFilter !== "all" && sprintFilter !== "none" && t.sprintId !== sprintFilter)
        return false;
      if (labelFilter !== "all" && !t.labels.includes(labelFilter)) return false;
      if (dueFilter !== "all") {
        if (dueFilter === "none") {
          if (t.dueDate) return false;
        } else if (!t.dueDate) {
          return false;
        } else {
          const now = new Date();
          const due = new Date(t.dueDate);
          const diff = differenceInCalendarDays(due, now);
          if (dueFilter === "overdue" && !(diff < 0 && t.status !== "done")) return false;
          if (dueFilter === "today" && diff !== 0) return false;
          if (dueFilter === "week" && !(diff >= 0 && diff <= 7)) return false;
        }
      }
      return true;
    });
  }, [wsAllTasks, assigneeFilter, priorityFilter, sprintFilter, labelFilter, dueFilter]);

  const activeFilterCount =
    (assigneeFilter !== "all" ? 1 : 0) +
    (priorityFilter !== "all" ? 1 : 0) +
    (sprintFilter !== "all" ? 1 : 0) +
    (labelFilter !== "all" ? 1 : 0) +
    (dueFilter !== "all" ? 1 : 0);

  const clearFilters = () => {
    setAssigneeFilter("all");
    setPriorityFilter("all");
    setSprintFilter("all");
    setLabelFilter("all");
    setDueFilter("all");
  };

  const LabelChip = ({ name }: { name: string }) => {
    const color = labelColorMap[name];
    if (color) {
      return (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: color }}
        >
          {name}
        </span>
      );
    }
    return (
      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">
        {name}
      </span>
    );
  };

  if (!workspace) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16 text-center">
          <h1 className="text-xl font-semibold">Workspace não encontrado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Talvez tenha sido removido ou o link esteja incorreto.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const canEdit = canEditWorkspace(workspace, profile?.id);

  const openNew = (status?: TaskStatus, defaultBoardColumnId?: string) =>
    setTaskDialog({ open: true, task: null, defaultStatus: status, defaultBoardColumnId });

  return (
    <AppShell>
      <div className="mx-auto min-w-0 max-w-[1600px] overflow-hidden px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <WorkspaceAvatar workspace={workspace} className="h-10 w-10 rounded-md text-base" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
              <p className="text-sm text-muted-foreground">
                {workspace.description || `${tasks.length} tarefas neste workspace`}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Tabs value={view} onValueChange={(v) => setView(v as ViewKind)}>
              <TabsList>
                <TabsTrigger value="kanban" className="gap-1.5">
                  <Columns3 className="h-3.5 w-3.5" /> Kanban
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-1.5">
                  <ListIcon className="h-3.5 w-3.5" /> Lista
                </TabsTrigger>
                <TabsTrigger value="timeline" className="gap-1.5">
                  <GanttChartSquare className="h-3.5 w-3.5" /> Timeline
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button asChild variant="outline" size="sm" className="hidden gap-1.5 sm:inline-flex">
              <Link to="/workspace/$workspaceId/labels" params={{ workspaceId }}>
                <Tag className="h-3.5 w-3.5" /> Etiquetas
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="hidden gap-1.5 sm:inline-flex">
              <Link to="/workspace/$workspaceId/team" params={{ workspaceId }}>
                <Users className="h-3.5 w-3.5" /> Equipe
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="hidden gap-1.5 sm:inline-flex">
              <Link to="/workspace/$workspaceId/sprints" params={{ workspaceId }}>
                <Sparkles className="h-3.5 w-3.5" /> Sprints
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="hidden gap-1.5 sm:inline-flex">
              <Link to="/workspace/$workspaceId/fields" params={{ workspaceId }}>
                <ClipboardList className="h-3.5 w-3.5" /> Campos
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="hidden gap-1.5 sm:inline-flex">
              <Link to="/workspace/$workspaceId/docs" params={{ workspaceId }}>
                <BookOpen className="h-3.5 w-3.5" /> Docs
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="hidden gap-1.5 sm:inline-flex">
              <Link to="/workspace/$workspaceId/goals" params={{ workspaceId }}>
                <Target className="h-3.5 w-3.5" /> Metas
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="hidden gap-1.5 sm:inline-flex">
              <Link to="/workspace/$workspaceId/automations" params={{ workspaceId }}>
                <Wand2 className="h-3.5 w-3.5" /> Automações
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="hidden gap-1.5 sm:inline-flex">
              <Link to="/workspace/$workspaceId/workload" params={{ workspaceId }}>
                <Users className="h-3.5 w-3.5" /> Workload
              </Link>
            </Button>
            <Button className="ml-auto gap-2 sm:ml-0" onClick={() => openNew()} disabled={!canEdit}>
              <Plus className="h-4 w-4" /> Nova tarefa
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2">
          <span className="w-full pl-1 text-xs font-medium text-muted-foreground sm:w-auto">
            Filtros:
          </span>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-10 w-[calc(50%-0.25rem)] text-xs sm:w-[160px]">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos responsáveis</SelectItem>
              <SelectItem value="none">Sem responsável</SelectItem>
              {workspace.members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={priorityFilter}
            onValueChange={(v) => setPriorityFilter(v as "all" | TaskPriority)}
          >
            <SelectTrigger className="h-10 w-[calc(50%-0.25rem)] text-xs sm:w-[140px]">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda prioridade</SelectItem>
              {(Object.keys(priorityLabels) as TaskPriority[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {priorityLabels[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sprintFilter} onValueChange={setSprintFilter}>
            <SelectTrigger className="h-10 w-[calc(50%-0.25rem)] text-xs sm:w-[160px]">
              <SelectValue placeholder="Sprint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos sprints</SelectItem>
              <SelectItem value="none">Sem sprint</SelectItem>
              {workspace.sprints
                .filter((sp) => belongsToProject(sp.projectId, activeProjectId))
                .map((sp) => (
                  <SelectItem key={sp.id} value={sp.id}>
                    {sp.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={labelFilter} onValueChange={setLabelFilter}>
            <SelectTrigger className="h-10 w-[calc(50%-0.25rem)] text-xs sm:w-[160px]">
              <SelectValue placeholder="Etiqueta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas etiquetas</SelectItem>
              {workspace.labels.map((l) => (
                <SelectItem key={l.id} value={l.name}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dueFilter} onValueChange={(v) => setDueFilter(v as DueFilter)}>
            <SelectTrigger className="h-10 w-[calc(50%-0.25rem)] text-xs sm:w-[150px]">
              <SelectValue placeholder="Prazo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Qualquer prazo</SelectItem>
              <SelectItem value="overdue">Atrasadas</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="week">Próximos 7 dias</SelectItem>
              <SelectItem value="none">Sem prazo</SelectItem>
            </SelectContent>
          </Select>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-10 gap-1 text-xs" onClick={clearFilters}>
              <X className="h-3 w-3" /> Limpar ({activeFilterCount})
            </Button>
          )}
          <span className="ml-auto pr-1 text-xs text-muted-foreground">
            {tasks.length} / {wsAllTasks.length}
          </span>
        </div>

        <div className="mt-6 min-w-0 max-w-full">
          {view === "kanban" && (
            <div className="w-full max-w-full overflow-x-auto overscroll-x-contain pb-4">
              <div className="flex min-w-max items-start gap-4">
                {boardColumns.map((column) => {
                  const status = column.status;
                  const items = tasks
                    .filter((t) =>
                      t.boardColumnId
                        ? t.boardColumnId === column.id
                        : boardColumns.find((item) => item.status === t.status)?.id === column.id,
                    )
                    .sort((a, b) => a.position - b.position);
                  return (
                    <div
                      key={column.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragId) {
                          if (column.id.startsWith("legacy-"))
                            moveTask(dragId, status, items.length);
                          else moveTaskToColumn(dragId, column.id, items.length);
                        }
                        setDragId(null);
                      }}
                      className="flex w-[min(82vw,320px)] shrink-0 flex-col rounded-lg border bg-muted/30 p-3"
                    >
                      <div className="mb-3 flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: column.color }}
                          />
                          <span className="text-sm font-medium">{column.name}</span>
                          <span className="text-xs text-muted-foreground">{items.length}</span>
                        </div>
                        <button
                          disabled={!canEdit}
                          onClick={() =>
                            openNew(status, column.id.startsWith("legacy-") ? undefined : column.id)
                          }
                          className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                          aria-label="Adicionar"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-col gap-2">
                        {items.map((task) => {
                          const assignedMembers = (
                            task.assigneeIds ?? (task.assigneeId ? [task.assigneeId] : [])
                          )
                            .map((id) => memberById[id])
                            .filter(Boolean);
                          const subsDone = task.subtasks.filter((s) => s.done).length;
                          const timeLogged = task.timeEntries.reduce((s, e) => s + e.minutes, 0);
                          return (
                            <div
                              key={task.id}
                              draggable={canEdit}
                              onDragStart={() => setDragId(task.id)}
                              onDragEnd={() => setDragId(null)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.stopPropagation();
                                if (canEdit && dragId) {
                                  if (column.id.startsWith("legacy-")) {
                                    moveTask(dragId, status, items.indexOf(task));
                                  } else {
                                    moveTaskToColumn(dragId, column.id, items.indexOf(task));
                                  }
                                }
                                setDragId(null);
                              }}
                              onClick={() => setTaskDialog({ open: true, task })}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setTaskDialog({ open: true, task });
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={`Abrir tarefa ${task.title}`}
                              className="group cursor-grab rounded-md border bg-card p-3 text-left shadow-sm transition hover:border-foreground/20 active:cursor-grabbing"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-medium leading-snug">
                                  {task.title}
                                </span>
                                <MoreHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                              </div>
                              {task.description && (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {task.description}
                                </p>
                              )}
                              {task.labels.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {task.labels.slice(0, 4).map((l) => (
                                    <LabelChip key={l} name={l} />
                                  ))}
                                  {task.labels.length > 4 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      +{task.labels.length - 4}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                                {blockedCount[task.id] && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                                    title={`Bloqueada por ${blockedCount[task.id]} tarefa(s)`}
                                  >
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    Bloqueada
                                  </span>
                                )}
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "h-5 px-1.5 text-[10px]",
                                    priorityStyles[task.priority],
                                  )}
                                >
                                  {priorityLabels[task.priority]}
                                </Badge>
                                {task.sprintId && sprintById[task.sprintId] && (
                                  <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    {sprintById[task.sprintId].name}
                                  </span>
                                )}
                                {assignedMembers.length > 0 && (
                                  <span
                                    className="inline-flex items-center -space-x-1"
                                    title={assignedMembers.map((member) => member.name).join(", ")}
                                  >
                                    {assignedMembers.slice(0, 3).map((member) => (
                                      <UserAvatar
                                        key={member.name}
                                        name={member.name}
                                        color={member.color}
                                        imageUrl={member.avatarUrl}
                                        className="h-5 w-5 border border-card text-[9px]"
                                      />
                                    ))}
                                    {assignedMembers.length > 3 && (
                                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-card bg-muted text-[9px]">
                                        +{assignedMembers.length - 3}
                                      </span>
                                    )}
                                  </span>
                                )}
                                {task.dueDate && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <CalendarDays className="h-3 w-3" />
                                    {format(new Date(task.dueDate), "d MMM", { locale: ptBR })}
                                  </span>
                                )}
                                {task.subtasks.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <ClipboardList className="h-3 w-3" />
                                    {subsDone}/{task.subtasks.length}
                                  </span>
                                )}
                                {timeLogged > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <Timer className="h-3 w-3" />
                                    {formatMinutes(timeLogged)}
                                  </span>
                                )}
                                {task.comments.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <MessageSquare className="h-3 w-3" />
                                    {task.comments.length}
                                  </span>
                                )}
                              </div>
                              {canEdit && (
                                <div
                                  className="mt-3 border-t pt-2 lg:hidden"
                                  onClick={(event) => event.stopPropagation()}
                                  onKeyDown={(event) => event.stopPropagation()}
                                >
                                  <Select
                                    value={column.id}
                                    onValueChange={(targetId) => {
                                      const target = boardColumns.find(
                                        (candidate) => candidate.id === targetId,
                                      );
                                      if (!target || target.id === column.id) return;
                                      if (target.id.startsWith("legacy-")) {
                                        moveTask(task.id, target.status);
                                      } else {
                                        moveTaskToColumn(task.id, target.id);
                                      }
                                    }}
                                  >
                                    <SelectTrigger
                                      className="h-10 text-xs"
                                      aria-label={`Mover ${task.title} para outra coluna`}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {boardColumns.map((target) => (
                                        <SelectItem key={target.id} value={target.id}>
                                          Mover para {target.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {items.length === 0 && canEdit && (
                          <button
                            onClick={() =>
                              openNew(
                                status,
                                column.id.startsWith("legacy-") ? undefined : column.id,
                              )
                            }
                            className="rounded-md border border-dashed p-3 text-xs text-muted-foreground hover:bg-background"
                          >
                            + Adicionar tarefa
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {canEdit && (
                  <div className="w-[min(78vw,300px)] shrink-0 rounded-lg border border-dashed bg-muted/10 p-3">
                    {addingColumn ? (
                      <form
                        className="space-y-3"
                        onSubmit={async (event) => {
                          event.preventDefault();
                          if (!activeProjectId || !columnName.trim()) return;
                          const saved = await createBoardColumn(activeProjectId, {
                            name: columnName.trim(),
                            status: columnStatus,
                            color:
                              columnStatus === "done"
                                ? "#22c55e"
                                : columnStatus === "todo"
                                  ? "#94a3b8"
                                  : "#0086f2",
                          });
                          if (saved) {
                            setColumnName("");
                            setColumnStatus("in_progress");
                            setAddingColumn(false);
                          }
                        }}
                      >
                        <Input
                          value={columnName}
                          onChange={(event) => setColumnName(event.target.value.slice(0, 60))}
                          placeholder="Nome da coluna"
                          autoFocus
                        />
                        <Select
                          value={columnStatus}
                          onValueChange={(value) => setColumnStatus(value as TaskStatus)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todo">A fazer</SelectItem>
                            <SelectItem value="in_progress">Em andamento</SelectItem>
                            <SelectItem value="done">Concluído</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" disabled={!columnName.trim()}>
                            Criar coluna
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setAddingColumn(false)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => setAddingColumn(true)}
                      >
                        <Plus className="h-4 w-4" /> Adicionar coluna
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {view === "list" && (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Tarefa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Sprint</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        Nenhuma tarefa corresponde aos filtros.
                      </TableCell>
                    </TableRow>
                  )}
                  {tasks.map((task) => {
                    const assignedMembers = (
                      task.assigneeIds ?? (task.assigneeId ? [task.assigneeId] : [])
                    )
                      .map((id) => memberById[id])
                      .filter(Boolean);
                    const subsDone = task.subtasks.filter((s) => s.done).length;
                    return (
                      <TableRow
                        key={task.id}
                        className="cursor-pointer"
                        onClick={() => setTaskDialog({ open: true, task })}
                      >
                        <TableCell>
                          <div className="font-medium">{task.title}</div>
                          {task.labels.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {task.labels.slice(0, 3).map((l) => (
                                <LabelChip key={l} name={l} />
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2 text-sm">
                            <span className={cn("h-2 w-2 rounded-full", statusDot[task.status])} />
                            {statusLabels[task.status]}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn("h-5 px-1.5 text-[10px]", priorityStyles[task.priority])}
                          >
                            {priorityLabels[task.priority]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {task.sprintId && sprintById[task.sprintId]
                            ? sprintById[task.sprintId].name
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {assignedMembers.length ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="flex -space-x-1">
                                {assignedMembers.slice(0, 3).map((member) => (
                                  <UserAvatar
                                    key={member.name}
                                    name={member.name}
                                    color={member.color}
                                    imageUrl={member.avatarUrl}
                                    className="h-5 w-5 border border-background text-[9px]"
                                  />
                                ))}
                              </span>
                              {assignedMembers.map((member) => member.name).join(", ")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {task.dueDate
                            ? format(new Date(task.dueDate), "d MMM", { locale: ptBR })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {task.subtasks.length > 0 ? `${subsDone}/${task.subtasks.length}` : "—"}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {task.comments.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <MessageSquare className="h-3 w-3" />
                              {task.comments.length}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          {view === "timeline" && (
            <TimelineView
              tasks={tasks}
              memberById={memberById}
              onOpen={(t) => setTaskDialog({ open: true, task: t })}
            />
          )}
          {pageInfo?.hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" onClick={() => void loadMoreWorkspaceTasks(workspaceId)}>
                Carregar mais tarefas
              </Button>
            </div>
          )}
        </div>
      </div>

      <TaskDialog
        open={taskDialog.open}
        onOpenChange={(open) => setTaskDialog((s) => ({ ...s, open }))}
        workspaceId={workspaceId}
        task={taskDialog.task}
        defaultStatus={taskDialog.defaultStatus}
        defaultBoardColumnId={taskDialog.defaultBoardColumnId}
        readOnly={!canEdit}
      />
    </AppShell>
  );
}

function TimelineView({
  tasks,
  memberById,
  onOpen,
}: {
  tasks: Task[];
  memberById: Record<string, { name: string; color: string }>;
  onOpen: (t: Task) => void;
}) {
  const dated = tasks.filter((t) => t.startDate || t.dueDate);

  if (dated.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Nenhuma tarefa com data de início ou prazo para exibir na timeline.
      </Card>
    );
  }

  const dates = dated.flatMap((t) => {
    const arr: Date[] = [];
    if (t.startDate) arr.push(new Date(t.startDate));
    if (t.dueDate) arr.push(new Date(t.dueDate));
    return arr;
  });
  const rangeStart = min(dates);
  const rangeEnd = max(dates);
  const totalDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart) + 1);

  const ticks: { label: string; offset: number }[] = [];
  const tickStep = Math.max(1, Math.round(totalDays / 8));
  for (let i = 0; i <= totalDays; i += tickStep) {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + i);
    ticks.push({ label: format(d, "d MMM", { locale: ptBR }), offset: (i / totalDays) * 100 });
  }

  return (
    <Card className="overflow-x-auto overscroll-x-contain p-0">
      <div className="min-w-[520px]">
        <div className="relative border-b bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <div className="relative h-4">
            {ticks.map((t, i) => (
              <span key={i} className="absolute -translate-x-1/2" style={{ left: `${t.offset}%` }}>
                {t.label}
              </span>
            ))}
          </div>
        </div>
        <div className="divide-y">
          {dated.map((t) => {
            const s = t.startDate ? new Date(t.startDate) : new Date(t.dueDate!);
            const e = t.dueDate ? new Date(t.dueDate) : new Date(t.startDate!);
            const startOffset = (differenceInCalendarDays(s, rangeStart) / totalDays) * 100;
            const width = Math.max(2, ((differenceInCalendarDays(e, s) + 1) / totalDays) * 100);
            const assignedMembers = (t.assigneeIds ?? (t.assigneeId ? [t.assigneeId] : []))
              .map((id) => memberById[id])
              .filter(Boolean);
            const mem = assignedMembers[0];
            const color =
              t.priority === "high"
                ? "#ef4444"
                : t.priority === "medium"
                  ? "#f59e0b"
                  : (mem?.color ?? "#0086f2");
            return (
              <button
                key={t.id}
                onClick={() => onOpen(t)}
                className="grid w-full grid-cols-[150px_minmax(320px,1fr)] items-center gap-3 px-4 py-2 text-left transition hover:bg-muted/40 sm:grid-cols-[220px_minmax(320px,1fr)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {statusLabels[t.status]}
                    {assignedMembers.length
                      ? ` · ${assignedMembers.map((member) => member.name).join(", ")}`
                      : ""}
                  </p>
                </div>
                <div className="relative h-6">
                  <div className="absolute inset-y-0 left-0 right-0 rounded bg-muted/40" />
                  <div
                    className={cn(
                      "absolute top-0.5 flex h-5 items-center rounded px-2 text-[10px] font-medium text-white",
                      t.status === "done" && "opacity-60",
                    )}
                    style={{
                      left: `${startOffset}%`,
                      width: `${width}%`,
                      backgroundColor: color,
                    }}
                  >
                    <span className="truncate">
                      {format(s, "d MMM", { locale: ptBR })}
                      {t.dueDate && s.getTime() !== e.getTime()
                        ? ` → ${format(e, "d MMM", { locale: ptBR })}`
                        : ""}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
