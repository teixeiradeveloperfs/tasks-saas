import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCheck, Inbox as InboxIcon } from "lucide-react";
import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useProfile, useStore } from "@/state/workspace-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — Taskora" },
      { name: "description", content: "Feed de atividades e menções nas suas tarefas." },
    ],
  }),
  component: InboxPage,
});

function InboxPage() {
  const tasks = useStore((s) => s.tasks);
  const workspaces = useStore((s) => s.workspaces);
  const profile = useProfile();
  const markRead = useStore((s) => s.markNotificationsRead);

  const wsById = useMemo(() => Object.fromEntries(workspaces.map((w) => [w.id, w])), [workspaces]);

  const cutoff = profile.notificationsReadAt ? new Date(profile.notificationsReadAt).getTime() : 0;

  const items = useMemo(() => {
    const all: {
      id: string;
      taskId: string;
      workspaceId: string;
      text: string;
      author: string;
      createdAt: string;
      isUnread: boolean;
    }[] = [];
    for (const t of tasks) {
      for (const a of t.activity) {
        all.push({
          id: `${t.id}:${a.id}`,
          taskId: t.id,
          workspaceId: t.workspaceId,
          text: a.text,
          author: a.author,
          createdAt: a.createdAt,
          isUnread: new Date(a.createdAt).getTime() > cutoff && a.author !== profile.name,
        });
      }
    }
    return all
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 100);
  }, [tasks, cutoff, profile.name]);

  const unread = items.filter((i) => i.isUnread).length;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Notificações
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <InboxIcon className="h-6 w-6" /> Inbox
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Toda atividade recente nas tarefas dos seus workspaces.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={markRead}
            disabled={unread === 0}
            className="w-full gap-1.5 sm:w-auto"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Marcar tudo como lido
          </Button>
        </div>

        <Card className="mt-6 divide-y p-0">
          {items.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">Sem atividade ainda.</p>
          )}
          {items.map((n) => {
            const ws = wsById[n.workspaceId];
            const task = tasks.find((t) => t.id === n.taskId);
            return (
              <Link
                key={n.id}
                to="/workspace/$workspaceId/board"
                params={{ workspaceId: n.workspaceId }}
                className={cn(
                  "flex items-start gap-3 p-4 transition hover:bg-muted/40",
                  n.isUnread && "bg-primary/5",
                )}
              >
                <span
                  className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: ws?.color ?? "#94a3b8" }}
                >
                  {n.author.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{n.author}</span>{" "}
                    <span className="text-muted-foreground">{n.text}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {task?.title ?? "Tarefa"} · {ws?.name ?? "—"}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {format(new Date(n.createdAt), "d MMM, HH:mm", { locale: ptBR })}
                </span>
                {n.isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </Card>
      </div>
    </AppShell>
  );
}
