import { CalendarDays, ExternalLink, LoaderCircle, Trash2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import type { Meeting, MeetingConnection } from "@task-flow/shared/domain/meeting-contracts";
import type { Workspace } from "@task-flow/shared/domain/models";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cancelMeeting, createMeeting, updateMeeting } from "@/lib/api/meeting";

function localDateTime(value: Date | string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function defaultTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return {
    start: localDateTime(start),
    end: localDateTime(new Date(start.getTime() + 60 * 60_000)),
  };
}

export function MeetingDialog({
  open,
  onOpenChange,
  meeting,
  workspaces,
  connection,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting?: Meeting;
  workspaces: Workspace[];
  connection: MeetingConnection;
  onSaved: () => Promise<void>;
}) {
  const [workspaceId, setWorkspaceId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [attendees, setAttendees] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    const defaults = defaultTimes();
    setWorkspaceId(meeting?.workspaceId ?? workspaces[0]?.id ?? "");
    setTitle(meeting?.title ?? "");
    setDescription(meeting?.description ?? "");
    setStartAt(meeting ? localDateTime(meeting.startAt) : defaults.start);
    setEndAt(meeting ? localDateTime(meeting.endAt) : defaults.end);
    setAttendees(meeting?.attendeeEmails.join(", ") ?? "");
    setSaving(false);
    setConfirmingCancel(false);
    setError(undefined);
  }, [meeting, open, workspaces]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!meeting && !connection.connected) {
      setError("Conecte seu Google Calendar para criar a reunião e gerar o link do Meet.");
      return;
    }
    if (!workspaceId || !title.trim() || !startAt || !endAt) {
      setError("Preencha workspace, título, início e término.");
      return;
    }
    const attendeeEmails = [
      ...new Set(
        attendees
          .split(/[\s,;]+/)
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    if (attendeeEmails.some((email) => !/^\S+@\S+\.\S+$/.test(email))) {
      setError("Revise os e-mails dos participantes.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const data = {
        title: title.trim(),
        description: description.trim() || undefined,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        attendeeEmails,
      };
      if (meeting)
        await updateMeeting(meeting.id, {
          ...data,
          createMeet: connection.connected && !meeting.meetUri,
        });
      else await createMeeting({ ...data, workspaceId, createMeet: true });
      await onSaved();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a reunião.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader className="border-b px-4 py-4 pr-12 sm:px-6">
            <DialogTitle>{meeting ? "Editar reunião" : "Nova reunião"}</DialogTitle>
            <DialogDescription>
              {connection.connected
                ? `O evento será sincronizado com ${connection.googleEmail} e terá um link do Meet.`
                : "Conecte seu Google Calendar para gerar o evento, os convites e o link do Meet."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-4 py-5 sm:px-6">
            {!connection.connected && !meeting && (
              <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-sm">
                <p className="font-medium">Quer criar o evento e o Google Meet?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Conecte sua conta antes de salvar a reunião.
                </p>
                <Button asChild type="button" size="sm" className="mt-3">
                  <a href="/api/integrations/google-calendar/start?returnTo=/calendar">
                    <CalendarDays className="h-4 w-4" /> Conectar Google Calendar
                  </a>
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Label>Workspace</Label>
              <Select
                value={workspaceId}
                onValueChange={setWorkspaceId}
                disabled={Boolean(meeting)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-title">Título</Label>
              <Input
                id="meeting-title"
                value={title}
                onChange={(event) => setTitle(event.target.value.slice(0, 160))}
                placeholder="Ex.: Alinhamento semanal"
                autoFocus
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="meeting-start">Início</Label>
                <Input
                  id="meeting-start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meeting-end">Término</Label>
                <Input
                  id="meeting-end"
                  type="datetime-local"
                  value={endAt}
                  onChange={(event) => setEndAt(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-attendees">Participantes</Label>
              <Input
                id="meeting-attendees"
                value={attendees}
                onChange={(event) => setAttendees(event.target.value)}
                placeholder="ana@empresa.com, joao@empresa.com"
              />
              <p className="text-[11px] text-muted-foreground">
                Os convidados recebem a atualização pelo Google Calendar.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-description">Descrição</Label>
              <Textarea
                id="meeting-description"
                value={description}
                onChange={(event) => setDescription(event.target.value.slice(0, 4000))}
                rows={3}
                placeholder="Pauta e contexto da reunião"
              />
            </div>
            {meeting?.meetUri && (
              <Button type="button" variant="outline" asChild>
                <a href={meeting.meetUri} target="_blank" rel="noreferrer">
                  <Video className="h-4 w-4" /> Entrar no Meet{" "}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="border-t px-4 py-4 sm:justify-between sm:px-6">
            <div>
              {meeting &&
                (confirmingCancel ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await cancelMeeting(meeting.id);
                        await onSaved();
                        onOpenChange(false);
                      } catch (cause) {
                        setError(
                          cause instanceof Error ? cause.message : "Não foi possível cancelar.",
                        );
                        setSaving(false);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Confirmar cancelamento
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmingCancel(true)}
                  >
                    Cancelar reunião
                  </Button>
                ))}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button type="submit" disabled={saving || (!meeting && !connection.connected)}>
                {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {saving
                  ? "Salvando…"
                  : !meeting && !connection.connected
                    ? "Conecte o Google primeiro"
                    : "Salvar reunião"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
