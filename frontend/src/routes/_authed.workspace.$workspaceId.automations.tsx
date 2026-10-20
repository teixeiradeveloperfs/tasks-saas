import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, Plus, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  priorityLabels,
  statusLabels,
  useStore,
  type AutomationAction,
  type TaskPriority,
  type TaskStatus,
} from "@/state/workspace-store";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/automations")({
  component: AutomationsPage,
});

type ActionKind = AutomationAction["kind"];

function AutomationsPage() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const create = useStore((s) => s.createAutomation);
  const update = useStore((s) => s.updateAutomation);
  const remove = useStore((s) => s.deleteAutomation);

  const [name, setName] = useState("");
  const [toStatus, setToStatus] = useState<TaskStatus>("done");
  const [actionKind, setActionKind] = useState<ActionKind>("set_priority");
  const [memberId, setMemberId] = useState<string>("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [sprintId, setSprintId] = useState<string>("");
  const [labelName, setLabelName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe um nome.");
      return;
    }
    let action: AutomationAction;
    if (actionKind === "assign") {
      if (!memberId) return setError("Selecione um responsável.");
      action = { kind: "assign", memberId };
    } else if (actionKind === "set_priority") {
      action = { kind: "set_priority", priority };
    } else if (actionKind === "set_sprint") {
      action = { kind: "set_sprint", sprintId };
    } else {
      if (!labelName) return setError("Selecione uma etiqueta.");
      action = { kind: "add_label", label: labelName };
    }
    const created = create(workspaceId, {
      name,
      trigger: { kind: "status_changed", to: toStatus },
      action,
    });
    if (!created) return setError("Não foi possível criar.");
    setName("");
  };

  const describeAction = (a: AutomationAction) => {
    if (a.kind === "assign") {
      const m = workspace.members.find((x) => x.id === a.memberId);
      return `atribuir a ${m?.name ?? "—"}`;
    }
    if (a.kind === "set_priority") return `definir prioridade "${priorityLabels[a.priority]}"`;
    if (a.kind === "set_sprint") {
      const sp = workspace.sprints.find((x) => x.id === a.sprintId);
      return a.sprintId ? `mover para sprint "${sp?.name ?? "—"}"` : "remover do sprint";
    }
    return `adicionar etiqueta "${a.label}"`;
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
            Automações
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Wand2 className="h-6 w-6" /> Regras de automação
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quando o status de uma tarefa mudar, executar uma ação automaticamente.
          </p>
        </div>

        <Card className="mt-6 p-5">
          <h2 className="text-sm font-semibold">Nova regra</h2>
          <form onSubmit={submit} className="mt-3 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="a-name">Nome</Label>
              <Input
                id="a-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 80))}
                placeholder="Ex.: Ao concluir, remover do sprint"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Quando status mudar para</Label>
                <Select value={toStatus} onValueChange={(v) => setToStatus(v as TaskStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(statusLabels) as TaskStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabels[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Então</Label>
                <Select value={actionKind} onValueChange={(v) => setActionKind(v as ActionKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set_priority">Alterar prioridade</SelectItem>
                    <SelectItem value="assign">Atribuir a alguém</SelectItem>
                    <SelectItem value="set_sprint">Mover para sprint</SelectItem>
                    <SelectItem value="add_label">Adicionar etiqueta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {actionKind === "assign" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Responsável</Label>
                  <Select value={memberId} onValueChange={setMemberId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {workspace.members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {actionKind === "set_priority" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Prioridade</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(priorityLabels) as TaskPriority[]).map((p) => (
                        <SelectItem key={p} value={p}>
                          {priorityLabels[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {actionKind === "set_sprint" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Sprint</Label>
                  <Select
                    value={sprintId || "none"}
                    onValueChange={(v) => setSprintId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Remover do sprint</SelectItem>
                      {workspace.sprints.map((sp) => (
                        <SelectItem key={sp.id} value={sp.id}>
                          {sp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {actionKind === "add_label" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Etiqueta</Label>
                  <Select value={labelName} onValueChange={setLabelName}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {workspace.labels.map((l) => (
                        <SelectItem key={l.id} value={l.name}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" className="gap-2">
              <Plus className="h-4 w-4" /> Criar regra
            </Button>
          </form>
        </Card>

        <div className="mt-8 space-y-2">
          <h2 className="text-sm font-semibold">Regras ({workspace.automations.length})</h2>
          {workspace.automations.length === 0 && (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma automação ainda.
            </p>
          )}
          {workspace.automations.map((a) => (
            <Card key={a.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Quando status → <span className="font-medium">{statusLabels[a.trigger.to]}</span>,{" "}
                  {describeAction(a.action)}
                </p>
              </div>
              <Switch
                checked={a.enabled}
                onCheckedChange={(v) => update(workspaceId, a.id, { enabled: v })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => remove(workspaceId, a.id)}
                aria-label="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
