import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, Loader2, Plus, ShieldAlert, Trash2, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ProjectAccessPicker } from "@/components/project-access-picker";
import { UserAvatar } from "@/components/user-avatar";
import { createInvite } from "@/lib/api/invite";
import { ApiError } from "@/lib/api/client";
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
import { cn } from "@/lib/utils";
import { useProfile, useStore } from "@/state/workspace-store";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/team")({
  component: TeamPage,
});

function TeamPage() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const profile = useProfile();
  const tasks = useStore((s) => s.tasks);
  const updateMember = useStore((s) => s.updateMember);
  const removeMember = useStore((s) => s.removeMember);

  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"ADMIN" | "MEMBER" | "VIEWER">("MEMBER");
  const [inviteProjectIds, setInviteProjectIds] = useState<string[]>([]);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(
    null,
  );

  const taskCountByMember = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tasks) {
      if (t.workspaceId !== workspaceId) continue;
      for (const assigneeId of t.assigneeIds ?? (t.assigneeId ? [t.assigneeId] : [])) {
        map[assigneeId] = (map[assigneeId] ?? 0) + 1;
      }
    }
    return map;
  }, [tasks, workspaceId]);

  if (!workspace) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16 text-center">
          <h1 className="text-xl font-semibold">Workspace não encontrado</h1>
          <Button asChild className="mt-6">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const currentMember = workspace.members.find((member) => member.id === profile.id);
  const canManage = currentMember?.permission === "OWNER" || currentMember?.permission === "ADMIN";
  // Quem gerencia a equipe é administrador, e administrador enxerga todo projeto —
  // então esta lista já é a do workspace inteiro.
  const projects = workspace.projects ?? [];

  if (!canManage) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">Acesso administrativo</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Somente proprietários e administradores podem gerenciar a equipe.
          </p>
          <Button asChild className="mt-6">
            <Link to="/workspace/$workspaceId" params={{ workspaceId }}>
              Voltar ao workspace
            </Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingInvite) return;
    setFeedback(null);
    if (!email.trim()) {
      setFeedback({ kind: "error", text: "Informe o e-mail para enviar o convite." });
      return;
    }
    setCreatingInvite(true);
    try {
      const invite = await createInvite({
        data: { workspaceId, email, permission, projectIds: inviteProjectIds },
      });
      try {
        await navigator.clipboard.writeText(invite.url);
        setFeedback({ kind: "success", text: `Convite criado e link copiado: ${invite.url}` });
      } catch {
        // O convite já existe mesmo quando o navegador bloqueia o clipboard.
        // Mantemos a URL visível para copiar sem gerar e invalidar outro token.
        setFeedback({ kind: "success", text: `Convite criado. Copie este link: ${invite.url}` });
      }
      setEmail("");
      setPermission("MEMBER");
      setInviteProjectIds([]);
    } catch (cause) {
      setFeedback({
        kind: "error",
        text:
          cause instanceof ApiError
            ? cause.message
            : "Não foi possível criar o convite. Tente novamente.",
      });
    } finally {
      setCreatingInvite(false);
    }
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
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Equipe
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Membros do workspace</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Informe o e-mail e o acesso. A pessoa preencherá nome, função e senha pelo link.
            </p>
          </div>
        </div>

        <Card className="mt-8 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4" /> Convidar pessoa
          </h2>
          <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="m-email">Email</Label>
              <Input
                id="m-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.slice(0, 120))}
                placeholder="ana@empresa.com"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label>Nível de acesso</Label>
              <Select
                value={permission}
                onValueChange={(value) => setPermission(value as "ADMIN" | "MEMBER" | "VIEWER")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Administrador</SelectItem>
                  <SelectItem value="MEMBER">Membro</SelectItem>
                  <SelectItem value="VIEWER">Somente leitura</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Projetos liberados</Label>
              <div>
                <ProjectAccessPicker
                  projects={projects}
                  selected={inviteProjectIds}
                  onChange={setInviteProjectIds}
                  grantedByRole={permission === "ADMIN"}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {permission === "ADMIN"
                  ? "Administradores enxergam todos os projetos do workspace."
                  : "A pessoa verá apenas os projetos marcados. Dá para mudar depois."}
              </p>
            </div>
            {feedback && (
              <p
                className={cn(
                  "text-xs sm:col-span-2",
                  feedback.kind === "error" ? "text-destructive" : "text-foreground",
                )}
              >
                {feedback.text}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" className="gap-2" disabled={creatingInvite}>
                {creatingInvite ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {creatingInvite ? "Criando convite…" : "Criar convite e copiar link"}
              </Button>
            </div>
          </form>
        </Card>

        <div className="mt-8">
          <h2 className="text-sm font-semibold">Membros ({workspace.members.length})</h2>
          <div className="mt-3 space-y-2">
            {workspace.members.length === 0 && (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhum membro ainda.
              </p>
            )}
            {workspace.members.map((m) => (
              <Card key={m.id} className="flex flex-wrap items-center gap-3 p-3">
                <UserAvatar
                  name={m.name}
                  color={m.color}
                  imageUrl={m.avatarUrl}
                  className="h-10 w-10 text-sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate px-1 text-sm font-medium">{m.name}</p>
                  <div className="flex min-w-0 items-center gap-1 px-1 text-xs text-muted-foreground">
                    <input
                      className="min-w-0 max-w-40 rounded bg-transparent outline-none focus:ring-1 focus:ring-primary/40"
                      defaultValue={m.role ?? ""}
                      maxLength={60}
                      placeholder="Função no workspace"
                      onBlur={(event) => {
                        const role = event.target.value.trim();
                        if (role !== (m.role ?? "")) updateMember(workspaceId, m.id, { role });
                      }}
                    />
                    {m.email && <span className="truncate">· {m.email}</span>}
                  </div>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {taskCountByMember[m.id] ?? 0} tarefas
                </span>
                <ProjectAccessPicker
                  projects={projects}
                  selected={m.projectIds ?? []}
                  onChange={(projectIds) => updateMember(workspaceId, m.id, { projectIds })}
                  grantedByRole={m.permission === "OWNER" || m.permission === "ADMIN"}
                />
                {m.permission === "OWNER" ? (
                  <span className="rounded bg-muted px-2 py-1 text-xs">Proprietário</span>
                ) : (
                  <Select
                    value={m.permission}
                    onValueChange={(permission) =>
                      updateMember(workspaceId, m.id, {
                        permission: permission as "ADMIN" | "MEMBER" | "VIEWER",
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[125px] text-xs sm:w-[145px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Administrador</SelectItem>
                      <SelectItem value="MEMBER">Membro</SelectItem>
                      <SelectItem value="VIEWER">Somente leitura</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {m.permission !== "OWNER" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeMember(workspaceId, m.id)}
                    aria-label={`Remover ${m.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
