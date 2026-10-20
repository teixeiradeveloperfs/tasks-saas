import { FolderKanban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Project } from "@/state/workspace-store";

type Props = {
  projects: Project[];
  selected: string[];
  onChange: (projectIds: string[]) => void;
  /** Quando o acesso vem do cargo, a escolha não se aplica. */
  grantedByRole?: boolean;
  className?: string;
};

/**
 * Escolhe a quais projetos alguém tem acesso. Serve tanto ao convite, onde define
 * o que a pessoa encontrará ao entrar, quanto à linha do membro já existente.
 */
export function ProjectAccessPicker({
  projects,
  selected,
  onChange,
  grantedByRole = false,
  className,
}: Props) {
  const label = grantedByRole
    ? "Todos os projetos"
    : selected.length === 0
      ? "Nenhum projeto"
      : selected.length === projects.length
        ? "Todos os projetos"
        : `${selected.length} de ${projects.length} projetos`;

  if (grantedByRole) {
    return (
      <span
        className={cn("rounded bg-muted px-2 py-1 text-xs text-muted-foreground", className)}
        title="Administradores enxergam todos os projetos do workspace."
      >
        {label}
      </span>
    );
  }

  const toggle = (projectId: string) =>
    onChange(
      selected.includes(projectId)
        ? selected.filter((id) => id !== projectId)
        : [...selected, projectId],
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5 text-xs font-normal", className)}
        >
          <FolderKanban className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        {projects.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Este workspace ainda não tem projetos.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="text-xs font-medium">Projetos</span>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() =>
                  onChange(
                    selected.length === projects.length
                      ? []
                      : projects.map((project) => project.id),
                  )
                }
              >
                {selected.length === projects.length ? "Limpar" : "Todos"}
              </button>
            </div>
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {projects.map((project) => (
                <label
                  key={project.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={selected.includes(project.id)}
                    onCheckedChange={() => toggle(project.id)}
                  />
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <span className="truncate">{project.name}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
