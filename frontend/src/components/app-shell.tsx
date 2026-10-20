import { Link, useLocation } from "@tanstack/react-router";
import {
  CalendarDays,
  FileText,
  PenTool,
  FolderKanban,
  Home,
  Inbox,
  LayoutGrid,
  LogOut,
  Pin,
  Pencil,
  Plug,
  Plus,
  Rocket,
  Search,
  Settings2,
  Star,
  Tag,
  Target,
  Users,
  Wand2,
  Workflow,
  History,
  TerminalSquare,
  LockKeyhole,
  Share2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useProfile, useStore } from "@/state/workspace-store";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { ProjectDialog } from "@/components/project-dialog";
import { CommandPalette } from "@/components/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/api/auth";

const primaryNav = [
  { title: "Início", url: "/", icon: Home },
  { title: "Inbox", url: "/inbox", icon: Inbox },
  { title: "Reuniões", url: "/calendar", icon: CalendarDays },
  { title: "Compartilhados", url: "/shared", icon: Share2 },
] as const;

const ACTIVE_WORKSPACE_KEY = "flow-active-workspace";

export function AppShell({ children }: { children: ReactNode }) {
  const workspaces = useStore((s) => s.workspaces);
  const profile = useProfile();
  const tasks = useStore((s) => s.tasks);
  const { pathname } = useLocation();
  const [wsDialogOpen, setWsDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const pathnameWsId = pathname.match(/^\/workspace\/([^/]+)/)?.[1];
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : (window.localStorage.getItem(ACTIVE_WORKSPACE_KEY) ?? undefined),
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!pathnameWsId) return;
    setActiveWorkspaceId(pathnameWsId);
    window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, pathnameWsId);
  }, [pathnameWsId]);

  useEffect(() => {
    if (pathnameWsId) return;
    const activeStillExists = workspaces.some((workspace) => workspace.id === activeWorkspaceId);
    const fallbackId =
      profile.pinnedWorkspaces.find((id) => workspaces.some((workspace) => workspace.id === id)) ??
      workspaces[0]?.id;
    const nextId = activeStillExists ? activeWorkspaceId : fallbackId;
    if (nextId === activeWorkspaceId) return;
    setActiveWorkspaceId(nextId);
    if (nextId) window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, nextId);
    else window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  }, [activeWorkspaceId, pathnameWsId, profile.pinnedWorkspaces, workspaces]);

  const unread = useMemo(() => {
    const cutoff = profile.notificationsReadAt
      ? new Date(profile.notificationsReadAt).getTime()
      : 0;
    let count = 0;
    for (const t of tasks) {
      for (const a of t.activity) {
        if (new Date(a.createdAt).getTime() > cutoff && a.author !== profile.name) count += 1;
      }
    }
    return count;
  }, [tasks, profile.notificationsReadAt, profile.name]);

  const pinned = workspaces.filter((w) => profile.pinnedWorkspaces.includes(w.id));
  const others = workspaces.filter((w) => !profile.pinnedWorkspaces.includes(w.id));
  const workspaceList = [...pinned, ...others];

  const defaultWorkspaceId = pinned[0]?.id ?? workspaces[0]?.id;
  const validActiveWorkspaceId = workspaces.some((workspace) => workspace.id === activeWorkspaceId)
    ? activeWorkspaceId
    : undefined;
  const currentWsId = pathnameWsId ?? validActiveWorkspaceId ?? defaultWorkspaceId;
  const currentWs = currentWsId ? workspaces.find((w) => w.id === currentWsId) : undefined;
  const currentPermission = currentWs?.members.find(
    (member) => member.id === profile.id,
  )?.permission;
  const canManageTeam = currentPermission === "OWNER" || currentPermission === "ADMIN";
  const activeProjectIds = useStore((state) => state.activeProjectIds);
  const selectProject = useStore((state) => state.selectProject);
  const currentProjects = currentWs?.projects ?? [];
  const activeProjectId = currentWs
    ? currentProjects.some((project) => project.id === activeProjectIds[currentWs.id])
      ? activeProjectIds[currentWs.id]
      : currentProjects[0]?.id
    : undefined;
  const editingProject = currentProjects.find((project) => project.id === editingProjectId);
  const workspaceMainNav = currentWs
    ? [
        { title: "Visão geral", url: `/workspace/${currentWs.id}`, icon: Home, exact: true },
        { title: "Board", url: `/workspace/${currentWs.id}/board`, icon: LayoutGrid },
        { title: "Docs", url: `/workspace/${currentWs.id}/docs`, icon: FileText },
        { title: "Quadros", url: `/workspace/${currentWs.id}/whiteboards`, icon: PenTool },
        { title: "Runbooks", url: `/workspace/${currentWs.id}/runbooks`, icon: TerminalSquare },
        { title: "Sprints", url: `/workspace/${currentWs.id}/sprints`, icon: Rocket },
        { title: "Metas", url: `/workspace/${currentWs.id}/goals`, icon: Target },
        { title: "Workload", url: `/workspace/${currentWs.id}/workload`, icon: Workflow },
      ]
    : [];
  const workspaceSettingsNav = currentWs
    ? [
        ...(canManageTeam
          ? [
              { title: "Vault", url: `/workspace/${currentWs.id}/vault`, icon: LockKeyhole },
              { title: "Equipe", url: `/workspace/${currentWs.id}/team`, icon: Users },
            ]
          : []),
        { title: "Etiquetas", url: `/workspace/${currentWs.id}/labels`, icon: Tag },
        { title: "Campos", url: `/workspace/${currentWs.id}/fields`, icon: Settings2 },
        { title: "Auditoria", url: `/workspace/${currentWs.id}/audit`, icon: History },
        { title: "Automações", url: `/workspace/${currentWs.id}/automations`, icon: Wand2 },
        { title: "Integrações", url: `/workspace/${currentWs.id}/integrations`, icon: Plug },
      ]
    : [];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-16 shrink-0 justify-center border-b">
          <Link to="/" className="flex w-full items-center justify-center px-2">
            <span className="text-lg font-semibold tracking-tight group-data-[collapsible=icon]:text-base">
              Taskora
            </span>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Geral</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {primaryNav.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.url}
                      tooltip={item.title}
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {item.url === "/inbox" && unread > 0 && (
                          <span className="ml-auto inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground group-data-[collapsible=icon]:hidden">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {currentWs && (
            <>
              <SidebarGroup>
                <SidebarGroupLabel>
                  <FolderKanban className="mr-1 h-3 w-3" /> Workspace atual
                </SidebarGroupLabel>
                <Link
                  to="/workspace/$workspaceId"
                  params={{ workspaceId: currentWs.id }}
                  className="mx-2 mb-2 flex items-center gap-2 rounded-lg border bg-sidebar-accent/40 p-2 transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
                >
                  <WorkspaceAvatar workspace={currentWs} className="h-8 w-8 rounded-md text-sm" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-sm font-medium">{currentWs.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {currentPermission === "OWNER"
                        ? "Proprietário"
                        : currentPermission === "ADMIN"
                          ? "Administrador"
                          : currentPermission === "VIEWER"
                            ? "Somente leitura"
                            : "Membro"}
                    </p>
                  </div>
                </Link>
                <div className="mx-2 mb-2 group-data-[collapsible=icon]:hidden">
                  <div className="mb-1 flex items-center justify-between px-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Projetos
                    </span>
                    {canManageTeam && (
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                        onClick={() => {
                          setEditingProjectId(undefined);
                          setProjectDialogOpen(true);
                        }}
                        aria-label="Novo projeto"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {currentProjects.map((project) => (
                      <div key={project.id} className="group/project flex items-center gap-1">
                        <Link
                          to="/workspace/$workspaceId"
                          params={{ workspaceId: currentWs.id }}
                          onClick={() => selectProject(currentWs.id, project.id)}
                          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                            activeProjectId === project.id
                              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                          }`}
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: project.color }}
                          />
                          <span className="truncate">{project.name}</span>
                        </Link>
                        {canManageTeam && activeProjectId === project.id && (
                          <button
                            type="button"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                            onClick={() => {
                              setEditingProjectId(project.id);
                              setProjectDialogOpen(true);
                            }}
                            aria-label={`Editar ${project.name}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {workspaceMainNav.map((item) => {
                      const active = item.exact
                        ? pathname === item.url
                        : pathname === item.url || pathname.startsWith(`${item.url}/`);
                      return (
                        <SidebarMenuItem key={item.url}>
                          <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                            <Link to={item.url}>
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel>Configurações e ferramentas</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {workspaceSettingsNav.map((item) => {
                      const active = pathname === item.url || pathname.startsWith(`${item.url}/`);
                      return (
                        <SidebarMenuItem key={item.url}>
                          <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                            <Link to={item.url}>
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}

          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between">
              <span>Trocar workspace</span>
              <button
                onClick={() => setWsDialogOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                aria-label="Novo workspace"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {workspaceList.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                    Nenhum workspace ainda.
                  </p>
                )}
                {workspaceList.map((ws) => {
                  const active = currentWs?.id === ws.id;
                  const isPinned = profile.pinnedWorkspaces.includes(ws.id);
                  return (
                    <SidebarMenuItem key={ws.id}>
                      <SidebarMenuButton asChild isActive={active} tooltip={ws.name}>
                        <Link to="/workspace/$workspaceId" params={{ workspaceId: ws.id }}>
                          <WorkspaceAvatar
                            workspace={ws}
                            className="h-4 w-4 rounded-[4px] text-[10px]"
                          />
                          <span className="truncate">{ws.name}</span>
                          {isPinned && (
                            <Star className="ml-auto h-3 w-3 fill-current text-primary group-data-[collapsible=icon]:hidden" />
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t">
          <Link
            to="/profile"
            className="mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center"
          >
            <UserAvatar
              name={profile.name}
              color={profile.avatarColor}
              imageUrl={profile.avatarUrl}
              className="h-7 w-7 text-xs"
            />
            <div className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-medium">{profile.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {profile.role || profile.email}
              </p>
            </div>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={signingOut}
            className="mt-1 w-full justify-start gap-2 text-muted-foreground group-data-[collapsible=icon]:justify-center"
            onClick={async () => {
              if (signingOut) return;
              setSignOutError(false);
              setSigningOut(true);
              try {
                await signOut();
                window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
                window.location.replace("/login");
              } catch {
                setSigningOut(false);
                setSignOutError(true);
              }
            }}
            aria-label="Sair da conta"
            title="Sair da conta"
          >
            <LogOut className="h-4 w-4" />
            <span className="group-data-[collapsible=icon]:hidden">
              {signingOut ? "Saindo…" : "Sair"}
            </span>
          </Button>
          {signOutError && (
            <p
              className="px-2 text-[11px] text-destructive group-data-[collapsible=icon]:hidden"
              role="alert"
            >
              Não foi possível sair. Tente novamente.
            </p>
          )}
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 min-w-0 shrink-0 items-center gap-2 border-b bg-background/80 px-2 backdrop-blur sm:px-3">
          <SidebarTrigger />
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-background/60 px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="min-w-0 flex-1 truncate">Buscar tarefas, workspaces…</span>
            <kbd className="pointer-events-none hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline-flex">
              ⌘K
            </kbd>
          </button>
          <ThemeToggle />
          <PinCurrentWorkspace pathname={pathname} />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </SidebarInset>

      <WorkspaceDialog open={wsDialogOpen} onOpenChange={setWsDialogOpen} />
      {currentWs && (
        <ProjectDialog
          workspace={currentWs}
          project={editingProject}
          open={projectDialogOpen}
          onOpenChange={setProjectDialogOpen}
        />
      )}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </SidebarProvider>
  );
}

function PinCurrentWorkspace({ pathname }: { pathname: string }) {
  const match = pathname.match(/^\/workspace\/([^/]+)/);
  const wsId = match?.[1];
  const profile = useProfile();
  const pinned = wsId ? profile.pinnedWorkspaces.includes(wsId) : false;
  const togglePin = useStore((s) => s.togglePinWorkspace);
  if (!wsId) return null;
  return (
    <button
      type="button"
      onClick={() => togglePin(wsId)}
      className="flex h-10 w-10 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
      aria-label={pinned ? "Desafixar workspace" : "Fixar workspace"}
      title={pinned ? "Desafixar" : "Fixar"}
    >
      <Pin className={pinned ? "h-4 w-4 fill-current text-primary" : "h-4 w-4"} />
    </button>
  );
}
