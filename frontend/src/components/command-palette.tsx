import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  Home,
  Inbox,
  Sparkles,
  Target,
  UserCircle,
  Users,
  Wand2,
  Tag,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useStore } from "@/state/workspace-store";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const workspaces = useStore((s) => s.workspaces);
  const tasks = useStore((s) => s.tasks);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = (fn: () => void) => {
    onOpenChange(false);
    setTimeout(fn, 0);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar tarefas, workspaces, páginas…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Navegação">
          <CommandItem onSelect={() => go(() => navigate({ to: "/" }))}>
            <Home /> Início
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/inbox" }))}>
            <Inbox /> Inbox
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/calendar" }))}>
            <CalendarDays /> Reuniões
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/profile" }))}>
            <UserCircle /> Perfil
          </CommandItem>
        </CommandGroup>
        {workspaces.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Workspaces">
              {workspaces.map((w) => (
                <CommandItem
                  key={w.id}
                  value={`ws ${w.name}`}
                  onSelect={() =>
                    go(() =>
                      navigate({ to: "/workspace/$workspaceId", params: { workspaceId: w.id } }),
                    )
                  }
                >
                  <Building2 /> {w.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Recursos do workspace">
              {workspaces.map((w) => (
                <div key={`res-${w.id}`} className="contents">
                  <CommandItem
                    value={`docs ${w.name}`}
                    onSelect={() =>
                      go(() =>
                        navigate({
                          to: "/workspace/$workspaceId/docs",
                          params: { workspaceId: w.id },
                        }),
                      )
                    }
                  >
                    <BookOpen /> Docs — {w.name}
                  </CommandItem>
                  <CommandItem
                    value={`goals ${w.name}`}
                    onSelect={() =>
                      go(() =>
                        navigate({
                          to: "/workspace/$workspaceId/goals",
                          params: { workspaceId: w.id },
                        }),
                      )
                    }
                  >
                    <Target /> Metas — {w.name}
                  </CommandItem>
                  <CommandItem
                    value={`autom ${w.name}`}
                    onSelect={() =>
                      go(() =>
                        navigate({
                          to: "/workspace/$workspaceId/automations",
                          params: { workspaceId: w.id },
                        }),
                      )
                    }
                  >
                    <Wand2 /> Automações — {w.name}
                  </CommandItem>
                  <CommandItem
                    value={`workload ${w.name}`}
                    onSelect={() =>
                      go(() =>
                        navigate({
                          to: "/workspace/$workspaceId/workload",
                          params: { workspaceId: w.id },
                        }),
                      )
                    }
                  >
                    <Users /> Workload — {w.name}
                  </CommandItem>
                  <CommandItem
                    value={`sprints ${w.name}`}
                    onSelect={() =>
                      go(() =>
                        navigate({
                          to: "/workspace/$workspaceId/sprints",
                          params: { workspaceId: w.id },
                        }),
                      )
                    }
                  >
                    <Sparkles /> Sprints — {w.name}
                  </CommandItem>
                  <CommandItem
                    value={`labels ${w.name}`}
                    onSelect={() =>
                      go(() =>
                        navigate({
                          to: "/workspace/$workspaceId/labels",
                          params: { workspaceId: w.id },
                        }),
                      )
                    }
                  >
                    <Tag /> Etiquetas — {w.name}
                  </CommandItem>
                  <CommandItem
                    value={`fields ${w.name}`}
                    onSelect={() =>
                      go(() =>
                        navigate({
                          to: "/workspace/$workspaceId/fields",
                          params: { workspaceId: w.id },
                        }),
                      )
                    }
                  >
                    <ClipboardList /> Campos — {w.name}
                  </CommandItem>
                </div>
              ))}
            </CommandGroup>
          </>
        )}
        {tasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tarefas">
              {tasks.slice(0, 30).map((t) => {
                const ws = workspaces.find((w) => w.id === t.workspaceId);
                return (
                  <CommandItem
                    key={t.id}
                    value={`task ${t.title} ${ws?.name ?? ""}`}
                    onSelect={() =>
                      go(() =>
                        navigate({
                          to: "/workspace/$workspaceId/board",
                          params: { workspaceId: t.workspaceId },
                        }),
                      )
                    }
                  >
                    <span
                      className="mr-2 flex h-4 w-4 items-center justify-center rounded-[3px] text-[9px] font-semibold text-white"
                      style={{ backgroundColor: ws?.color ?? "#94a3b8" }}
                    >
                      {ws?.name.charAt(0).toUpperCase() ?? "?"}
                    </span>
                    <span className="truncate">{t.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
