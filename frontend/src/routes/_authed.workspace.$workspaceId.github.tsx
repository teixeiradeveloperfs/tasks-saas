import { Link, createFileRoute } from "@tanstack/react-router";
import type {
  GitHubConnectionStatus,
  GitHubRepository,
  GitHubRepositoryActivity,
  GitHubWorkflowRun,
} from "@task-flow/shared/domain/github-contracts";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  CircleDot,
  GitBranch,
  Github,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Unlock,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  disconnectGitHubConnection,
  githubActivity,
  githubRepositories,
  githubStatus,
} from "@/lib/api/github";
import { useStore } from "@/state/workspace-store";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/github")({
  component: GitHubPage,
});

function runPresentation(run: GitHubWorkflowRun) {
  if (run.status !== "completed") {
    return { label: "Em andamento", icon: Loader2, className: "text-blue-600 dark:text-blue-400" };
  }
  if (run.conclusion === "success") {
    return {
      label: "Sucesso",
      icon: CheckCircle2,
      className: "text-emerald-600 dark:text-emerald-400",
    };
  }
  if (run.conclusion === "cancelled" || run.conclusion === "skipped") {
    return { label: "Cancelada", icon: CircleDot, className: "text-muted-foreground" };
  }
  return { label: "Falhou", icon: XCircle, className: "text-red-600 dark:text-red-400" };
}

function relativeDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}

function GitHubPage() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const [status, setStatus] = useState<GitHubConnectionStatus>();
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [repositoryKey, setRepositoryKey] = useState("");
  const [activity, setActivity] = useState<GitHubRepositoryActivity>();
  const [loading, setLoading] = useState(true);
  const [repositoriesLoading, setRepositoriesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const selectedRepository = useMemo(
    () =>
      repositories.find((item) => `${item.connectionId ?? ""}:${item.fullName}` === repositoryKey),
    [repositories, repositoryKey],
  );

  const loadConnection = useCallback(async () => {
    setLoading(true);
    try {
      const nextStatus = await githubStatus(workspaceId);
      setStatus(nextStatus);
      setLoading(false);
      if (nextStatus.connected) {
        setRepositoriesLoading(true);
        try {
          const nextRepositories = await githubRepositories(workspaceId);
          setRepositories(nextRepositories);
          const remembered = localStorage.getItem(`automa:github-repository:${workspaceId}`);
          const rememberedRepository = nextRepositories.find(
            (item) =>
              item.fullName === remembered ||
              `${item.connectionId ?? ""}:${item.fullName}` === remembered,
          );
          const initial = rememberedRepository ?? nextRepositories[0];
          setRepositoryKey(initial ? `${initial.connectionId ?? ""}:${initial.fullName}` : "");
        } finally {
          setRepositoriesLoading(false);
        }
      } else {
        setRepositories([]);
        setRepositoryKey("");
        setActivity(undefined);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o GitHub.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const loadActivity = useCallback(async () => {
    if (!selectedRepository?.connectionId) return;
    setRefreshing(true);
    try {
      const next = await githubActivity(
        workspaceId,
        selectedRepository.fullName,
        selectedRepository.connectionId,
      );
      setActivity(next);
      localStorage.setItem(`automa:github-repository:${workspaceId}`, repositoryKey);
    } catch (error) {
      setActivity(undefined);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível consultar o repositório.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [repositoryKey, selectedRepository, workspaceId]);

  useEffect(() => {
    void loadConnection();
    const result = new URLSearchParams(window.location.search).get("github");
    if (result === "connected") toast.success("GitHub conectado ao workspace.");
    if (result === "error") toast.error("A conexão com o GitHub não foi concluída.");
  }, [loadConnection]);

  useEffect(() => {
    setActivity(undefined);
    void loadActivity();
  }, [loadActivity]);

  if (!workspace) {
    return (
      <AppShell>
        <div className="px-4 py-16 text-center">Workspace não encontrado.</div>
      </AppShell>
    );
  }

  const connectUrl = `/api/integrations/github/start?workspaceId=${encodeURIComponent(
    workspaceId,
  )}&returnTo=${encodeURIComponent(`/workspace/${workspaceId}/github`)}`;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-8">
        <Link
          to="/workspace/$workspaceId/integrations"
          params={{ workspaceId }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Integrações
        </Link>

        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground text-background">
              <Github className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">GitHub</h1>
              <p className="text-sm text-muted-foreground">
                PRs e GitHub Actions de {workspace.name}.
              </p>
            </div>
          </div>
          {status?.configured && status.canManage && (
            <Button asChild variant="outline">
              <a href={connectUrl}>
                <Plus className="h-4 w-4" />
                {status.connected ? "Adicionar conta ou organização" : "Conectar GitHub"}
              </a>
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando integração…
          </div>
        ) : !status?.configured ? (
          <Card className="mt-8 max-w-3xl p-5 sm:p-6">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <h2 className="font-semibold">GitHub App ainda não configurado</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  O administrador da aplicação precisa cadastrar o GitHub App e adicionar as
                  credenciais no backend. Nenhum token pessoal será solicitado aos usuários.
                </p>
                <div className="mt-4 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  Permissões necessárias: Metadata (read), Pull requests (read) e Actions (read).
                  Configure também a Setup URL e a OAuth callback indicadas no arquivo{" "}
                  <code>backend/.env.example</code>.
                </div>
              </div>
            </div>
          </Card>
        ) : !status.connected ? (
          <Card className="mt-8 max-w-3xl p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Conecte os repositórios deste workspace</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Você escolherá no GitHub quais repositórios o Taskora poderá consultar. A
              instalação fica vinculada somente a este workspace.
            </p>
            {status.canManage ? (
              <Button asChild className="mt-5">
                <a href={connectUrl}>
                  <Github className="mr-2 h-4 w-4" /> Instalar GitHub App
                </a>
              </Button>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Peça a um OWNER ou ADMIN para fazer a conexão.
              </p>
            )}
          </Card>
        ) : (
          <>
            <Card className="mt-7 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Contas conectadas</h2>
                  <p className="text-xs text-muted-foreground">
                    {status.connections.length}{" "}
                    {status.connections.length === 1 ? "instalação" : "instalações"} neste workspace
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {status.connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="flex min-w-0 items-center gap-3 rounded-lg border p-3"
                  >
                    {connection.accountAvatar ? (
                      <img
                        src={connection.accountAvatar}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full"
                      />
                    ) : (
                      <Github className="h-8 w-8 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{connection.accountLogin}</p>
                      <p className="text-xs text-muted-foreground">
                        {connection.accountType === "Organization"
                          ? "Organização"
                          : "Conta pessoal"}
                      </p>
                    </div>
                    {status.canManage && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Desconectar ${connection.accountLogin}`}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Desconectar ${connection.accountLogin} deste workspace?`,
                            )
                          )
                            return;
                          await disconnectGitHubConnection(workspaceId, connection.id);
                          toast.success(`${connection.accountLogin} foi desconectado.`);
                          await loadConnection();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="mt-4 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">Repositórios autorizados</p>
                <p className="text-xs text-muted-foreground">
                  {repositoriesLoading
                    ? "Carregando repositórios…"
                    : `${repositories.length} repositório${repositories.length === 1 ? "" : "s"} em todas as contas`}
                </p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Select value={repositoryKey} onValueChange={setRepositoryKey}>
                  <SelectTrigger className="min-w-0 flex-1 sm:w-72">
                    <SelectValue placeholder="Escolha um repositório" />
                  </SelectTrigger>
                  <SelectContent>
                    {repositories.map((item) => (
                      <SelectItem
                        key={`${item.connectionId ?? ""}:${item.id}`}
                        value={`${item.connectionId ?? ""}:${item.fullName}`}
                      >
                        {item.fullName} · {item.accountLogin}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => void loadActivity()}
                  disabled={!selectedRepository || refreshing}
                  aria-label="Atualizar"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                </Button>
                {status.canManage && (
                  <Button
                    asChild
                    size="icon"
                    variant="outline"
                    aria-label="Configurar acesso no GitHub"
                  >
                    <a href={connectUrl}>
                      <Settings className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </Card>

            {repositoriesLoading ? (
              <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando repositórios…
              </div>
            ) : repositories.length === 0 ? (
              <Card className="mt-4 p-8 text-center text-sm text-muted-foreground">
                Nenhum repositório foi autorizado nessa instalação.
              </Card>
            ) : refreshing && !activity ? (
              <div className="flex min-h-56 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Consultando GitHub…
              </div>
            ) : activity ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card className="overflow-hidden">
                  <div className="border-b px-4 py-3">
                    <h2 className="font-semibold">Pull requests abertas</h2>
                    <p className="text-xs text-muted-foreground">
                      {activity.pullRequests.length} encontrada
                      {activity.pullRequests.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="divide-y">
                    {activity.pullRequests.map((pull) => (
                      <a
                        key={pull.id}
                        href={pull.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block p-4 transition hover:bg-muted/50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-snug">{pull.title}</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              #{pull.number} · {pull.author} · {pull.headBranch} → {pull.baseBranch}
                            </p>
                          </div>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                        {pull.draft && (
                          <Badge variant="secondary" className="mt-2">
                            Rascunho
                          </Badge>
                        )}
                      </a>
                    ))}
                    {activity.pullRequests.length === 0 && (
                      <p className="p-6 text-center text-sm text-muted-foreground">
                        Nenhuma PR aberta.
                      </p>
                    )}
                  </div>
                </Card>

                <Card className="overflow-hidden">
                  <div className="border-b px-4 py-3">
                    <h2 className="font-semibold">Execuções do Actions</h2>
                    <p className="text-xs text-muted-foreground">30 execuções mais recentes</p>
                  </div>
                  <div className="max-h-[520px] divide-y overflow-y-auto">
                    {activity.workflowRuns.map((run) => {
                      const presentation = runPresentation(run);
                      const Icon = presentation.icon;
                      return (
                        <a
                          key={run.id}
                          href={run.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-start gap-3 p-4 transition hover:bg-muted/50"
                        >
                          <Icon
                            className={`mt-0.5 h-4 w-4 shrink-0 ${presentation.className} ${run.status !== "completed" ? "animate-spin" : ""}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{run.title}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{presentation.label}</span>
                              {run.branch && (
                                <span className="inline-flex items-center gap-1">
                                  <GitBranch className="h-3 w-3" />
                                  {run.branch}
                                </span>
                              )}
                              <span>{relativeDate(run.updatedAt)}</span>
                            </div>
                          </div>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </a>
                      );
                    })}
                    {activity.workflowRuns.length === 0 && (
                      <p className="p-6 text-center text-sm text-muted-foreground">
                        Nenhuma execução encontrada.
                      </p>
                    )}
                  </div>
                </Card>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                {activity?.repository.private ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  <Unlock className="h-3 w-3" />
                )}{" "}
                {activity?.repository.private ? "Privado" : "Público"}
              </span>
              {activity && (
                <a
                  href={activity.repository.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground"
                >
                  Abrir repositório <ArrowUpRight className="inline h-3 w-3" />
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
