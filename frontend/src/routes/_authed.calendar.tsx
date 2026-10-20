import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, ChevronLeft, ChevronRight, ExternalLink, Plus, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import type { Meeting, MeetingConnection } from "@task-flow/shared/domain/meeting-contracts";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppShell } from "@/components/app-shell";
import { MeetingDialog } from "@/components/meeting-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useHydrated } from "@/hooks/use-hydrated";
import { calendarConnection, disconnectCalendar, listMeetings } from "@/lib/api/meeting";
import { cn } from "@/lib/utils";
import { useProfile, useStore } from "@/state/workspace-store";

export const Route = createFileRoute("/_authed/calendar")({
  validateSearch: z.object({ calendar: z.enum(["connected", "error"]).optional() }),
  head: () => ({
    meta: [
      { title: "Reuniões — Taskora" },
      { name: "description", content: "Reuniões do time com Google Calendar e Meet." },
    ],
  }),
  component: MeetingsPage,
});

const disconnected: MeetingConnection = { connected: false };

function MeetingsPage() {
  const hydrated = useHydrated();
  const profile = useProfile();
  const workspaces = useStore((state) => state.workspaces);
  const editableWorkspaces = workspaces.filter((workspace) => {
    const member = workspace.members.find((item) => item.id === profile.id);
    return member?.permission !== "VIEWER";
  });
  const search = Route.useSearch();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [connection, setConnection] = useState<MeetingConnection>(disconnected);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      const [items, status] = await Promise.all([listMeetings(), calendarConnection()]);
      setMeetings(items.filter((meeting) => !meeting.cancelledAt));
      setConnection(status);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as reuniões.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void refresh(), [refresh]);

  const workspaceById = useMemo(
    () => Object.fromEntries(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);
  const meetingsByDay = useMemo(() => {
    const result = new Map<string, Meeting[]>();
    for (const meeting of meetings) {
      const key = format(new Date(meeting.startAt), "yyyy-MM-dd");
      result.set(key, [...(result.get(key) ?? []), meeting]);
    }
    return result;
  }, [meetings]);
  const selectedMeetings = meetingsByDay.get(format(selected, "yyyy-MM-dd")) ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Agenda
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reuniões</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Organize reuniões do time e gere eventos com Google Meet.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
              {connection.connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await disconnectCalendar();
                    await refresh();
                  }}
                >
                  <CalendarCheck className="h-4 w-4 text-emerald-600" />
                  {connection.googleEmail}
                </Button>
              ) : (
                <Button variant="outline" size="sm" asChild>
                  <a href="/api/integrations/google-calendar/start?returnTo=/calendar">
                    <CalendarCheck className="h-4 w-4" /> Conectar Google Calendar
                  </a>
                </Button>
              )}
              <Button
                disabled={editableWorkspaces.length === 0}
                onClick={() => {
                  setEditing(undefined);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Nova reunião
              </Button>
            </div>
            {connection.connected && (
              <p className="text-[11px] text-muted-foreground">Clique na conta para desconectar.</p>
            )}
          </div>
        </div>

        {search.calendar === "connected" && (
          <p className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            Google Calendar conectado. Novas reuniões podem gerar evento, Meet e convites.
          </p>
        )}
        {search.calendar === "error" && (
          <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            Não foi possível conectar o Google Calendar. Verifique a autorização e tente novamente.
          </p>
        )}
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <div className="mt-6 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold capitalize">
            {format(cursor, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor((date) => subMonths(date, 1))}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const today = new Date();
                setCursor(today);
                setSelected(today);
              }}
            >
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor((date) => addMonths(date, 1))}
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="overflow-x-auto p-0">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-7 border-b bg-muted/30 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((day) => (
                  <div key={day} className="py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day) => {
                  const items = meetingsByDay.get(format(day, "yyyy-MM-dd")) ?? [];
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelected(day)}
                      className={cn(
                        "flex min-h-24 min-w-0 flex-col gap-1 border-b border-r p-1.5 text-left hover:bg-muted/40",
                        !isSameMonth(day, cursor) && "bg-muted/20 text-muted-foreground",
                        isSameDay(day, selected) &&
                          "bg-primary/5 ring-1 ring-inset ring-primary/40",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium",
                          isToday(day) && "bg-primary text-primary-foreground",
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      {items.slice(0, 3).map((meeting) => (
                        <span
                          key={meeting.id}
                          className="truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary"
                        >
                          {format(new Date(meeting.startAt), "HH:mm")} {meeting.title}
                        </span>
                      ))}
                      {items.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{items.length - 3}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card className="h-fit p-4 sm:p-5">
            <h2 className="text-sm font-semibold">
              {format(selected, "d 'de' MMMM", { locale: ptBR })}
            </h2>
            <p className="text-xs text-muted-foreground">
              {selectedMeetings.length} {selectedMeetings.length === 1 ? "reunião" : "reuniões"}
            </p>
            <div className="mt-4 space-y-2">
              {!loading && selectedMeetings.length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Nenhuma reunião neste dia.
                </p>
              )}
              {selectedMeetings.map((meeting) => {
                const canEdit = meeting.organizerId === profile.id;
                const openMeeting = () => {
                  if (!canEdit) return;
                  setEditing(meeting);
                  setDialogOpen(true);
                };
                return (
                  <div
                    key={meeting.id}
                    role={canEdit ? "button" : undefined}
                    tabIndex={canEdit ? 0 : undefined}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left",
                      canEdit && "cursor-pointer hover:bg-muted/40",
                    )}
                    onClick={openMeeting}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") openMeeting();
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{meeting.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {format(new Date(meeting.startAt), "HH:mm")}–
                          {format(new Date(meeting.endAt), "HH:mm")} ·{" "}
                          {workspaceById[meeting.workspaceId]?.name}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Organizada por {meeting.organizerName}
                        </p>
                      </div>
                      {meeting.meetUri && <Video className="h-4 w-4 shrink-0 text-primary" />}
                    </div>
                    {meeting.meetUri && (
                      <a
                        href={meeting.meetUri}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Entrar no Meet <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <MeetingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        meeting={editing}
        workspaces={editableWorkspaces}
        connection={connection}
        onSaved={refresh}
      />
    </AppShell>
  );
}
