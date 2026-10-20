import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, Users } from "lucide-react";
import { useMemo } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatMinutes, useStore } from "@/state/workspace-store";
import { belongsToProject, useActiveProject } from "@/state/use-active-project";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/workload")({
  component: WorkloadPage,
});

function WorkloadPage() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const { projectId: activeProjectId } = useActiveProject(workspaceId);
  const allTasks = useStore((s) => s.tasks);

  const tasks = useMemo(
    () =>
      allTasks.filter(
        (t) => t.workspaceId === workspaceId && belongsToProject(t.projectId, activeProjectId),
      ),
    [activeProjectId, allTasks, workspaceId],
  );

  const rows = useMemo(() => {
    if (!workspace) return [];
    const map = new Map<
      string,
      {
        memberId: string;
        name: string;
        color: string;
        open: number;
        inProgress: number;
        done: number;
        estimate: number;
        logged: number;
      }
    >();
    for (const m of workspace.members) {
      map.set(m.id, {
        memberId: m.id,
        name: m.name,
        color: m.color,
        open: 0,
        inProgress: 0,
        done: 0,
        estimate: 0,
        logged: 0,
      });
    }
    for (const t of tasks) {
      const assigneeIds = t.assigneeIds ?? (t.assigneeId ? [t.assigneeId] : []);
      for (const assigneeId of assigneeIds) {
        if (!map.has(assigneeId)) continue;
        const row = map.get(assigneeId)!;
        if (t.status === "done") row.done += 1;
        else if (t.status === "in_progress") row.inProgress += 1;
        else row.open += 1;
        row.estimate += t.estimateMinutes ?? 0;
        row.logged += t.timeEntries.reduce((s, e) => s + e.minutes, 0);
      }
    }
    return Array.from(map.values());
  }, [workspace, tasks]);

  const maxOpen = Math.max(1, ...rows.map((r) => r.open + r.inProgress));

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
            Workload
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users className="h-6 w-6" /> Carga por membro
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tarefas ativas, estimativas e tempo registrado por pessoa.
          </p>
        </div>

        <Card className="mt-6 divide-y p-0">
          {rows.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Sem membros neste workspace.
            </p>
          )}
          {rows.map((r) => {
            const active = r.open + r.inProgress;
            const pct = Math.round((active / maxOpen) * 100);
            return (
              <div
                key={r.memberId}
                className="grid gap-2 p-4 sm:grid-cols-[220px_1fr_auto] sm:items-center"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: r.color }}
                  >
                    {r.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.open} a fazer · {r.inProgress} em progresso · {r.done} concluídas
                    </p>
                  </div>
                </div>
                <Progress value={pct} />
                <div className="text-right text-xs text-muted-foreground">
                  <p>Est.: {formatMinutes(r.estimate)}</p>
                  <p>Log.: {formatMinutes(r.logged)}</p>
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </AppShell>
  );
}
