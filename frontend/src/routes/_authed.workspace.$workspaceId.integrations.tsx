import { Link, createFileRoute } from "@tanstack/react-router";
import { Calendar, CheckCircle2, ChevronLeft, Github, Settings } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { githubStatus } from "@/lib/api/github";
import { calendarConnection } from "@/lib/api/meeting";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/workspace-store";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/integrations")({
  component: IntegrationsPage,
});

type Category = "Dev" | "Produtividade";
type IntegrationId = "github" | "gcal";

interface IntegrationDef {
  id: IntegrationId;
  name: string;
  description: string;
  category: Category;
  icon: ComponentType<{ className?: string }>;
  color: string;
}

const CATALOG: IntegrationDef[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Acompanhe PRs e GitHub Actions do workspace.",
    category: "Dev",
    icon: Github,
    color: "#181717",
  },
  {
    id: "gcal",
    name: "Google Calendar + Meet",
    description: "Crie reuniões, envie convites e gere links do Meet.",
    category: "Produtividade",
    icon: Calendar,
    color: "#4285F4",
  },
];

const CATEGORIES: Array<Category | "Todas"> = ["Todas", "Dev", "Produtividade"];

function IntegrationLink({
  integrationId,
  workspaceId,
  icon = false,
}: {
  integrationId: IntegrationId;
  workspaceId: string;
  icon?: boolean;
}) {
  if (integrationId === "github") {
    return (
      <Button asChild size={icon ? "icon" : "sm"} variant={icon ? "ghost" : "default"}>
        <Link to="/workspace/$workspaceId/github" params={{ workspaceId }}>
          {icon ? <Settings className="h-4 w-4" /> : "Configurar"}
        </Link>
      </Button>
    );
  }
  return (
    <Button asChild size={icon ? "icon" : "sm"} variant={icon ? "ghost" : "default"}>
      <Link to="/calendar">{icon ? <Settings className="h-4 w-4" /> : "Configurar"}</Link>
    </Button>
  );
}

function IntegrationsPage() {
  const { workspaceId } = Route.useParams();
  const workspace = useStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Todas");
  const [connectionState, setConnectionState] = useState<Record<IntegrationId, boolean>>({
    github: false,
    gcal: false,
  });

  useEffect(() => {
    let active = true;
    void Promise.allSettled([githubStatus(workspaceId), calendarConnection()]).then(
      ([github, calendar]) => {
        if (!active) return;
        setConnectionState({
          github: github.status === "fulfilled" && github.value.connected,
          gcal: calendar.status === "fulfilled" && calendar.value.connected,
        });
      },
    );
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return CATALOG.filter((integration) => {
      if (category !== "Todas" && integration.category !== category) return false;
      if (!normalizedQuery) return true;
      return `${integration.name} ${integration.description}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalizedQuery);
    });
  }, [category, query]);

  const connected = CATALOG.filter((integration) => connectionState[integration.id]);

  if (!workspace) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <h1 className="text-xl font-semibold">Workspace não encontrado</h1>
          <Button asChild variant="link" className="mt-4">
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
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Voltar ao workspace
        </Link>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
            <p className="text-sm text-muted-foreground">
              Conecte {workspace.name} a ferramentas externas. {connected.length} ativa
              {connected.length === 1 ? "" : "s"}.
            </p>
          </div>
          <Input
            placeholder="Buscar integração…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full sm:w-64"
          />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition",
                category === item
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </div>

        {connected.length > 0 && category === "Todas" && !query && (
          <section className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Conectadas
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {connected.map((integration) => {
                const Icon = integration.icon;
                return (
                  <Card key={integration.id} className="flex items-center gap-3 p-4">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: integration.color }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {integration.name}
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {integration.category}
                      </p>
                    </div>
                    <IntegrationLink
                      integrationId={integration.id}
                      workspaceId={workspaceId}
                      icon
                    />
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Disponíveis
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((integration) => {
            const Icon = integration.icon;
            const isConnected = connectionState[integration.id];
            return (
              <Card key={integration.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: integration.color }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">{integration.name}</h3>
                      {isConnected && (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                          Ativa
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {integration.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {integration.category}
                  </span>
                  <IntegrationLink integrationId={integration.id} workspaceId={workspaceId} />
                </div>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              Nenhuma integração encontrada.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
