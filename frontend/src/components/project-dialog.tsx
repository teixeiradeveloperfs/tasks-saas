import { useEffect, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { useStore, type Project, type Workspace } from "@/state/workspace-store";

export function ProjectDialog({
  workspace,
  project,
  open,
  onOpenChange,
}: {
  workspace: Workspace;
  project?: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createProject = useStore((state) => state.createProject);
  const updateProject = useStore((state) => state.updateProject);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#0086f2");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setColor(project?.color ?? workspace.color ?? "#0086f2");
    setSaving(false);
  }, [open, project, workspace.color]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? "Editar projeto" : "Novo projeto"}</DialogTitle>
          <DialogDescription>
            Organize Board, tarefas, sprints, docs e metas dentro deste workspace.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const cleanName = name.trim();
            if (!cleanName || saving) return;
            setSaving(true);
            const data = {
              name: cleanName,
              description: description.trim() || undefined,
              color,
            };
            const saved = project
              ? await updateProject(workspace.id, project.id, data)
              : await createProject(workspace.id, data);
            setSaving(false);
            if (saved) onOpenChange(false);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="project-name">Nome</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 80))}
              placeholder="Ex.: Site institucional"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Descrição</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, 1000))}
              placeholder="Contexto e objetivo do projeto"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-color">Cor</Label>
            <div className="flex items-center gap-2">
              <Input
                id="project-color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-9 w-14 p-1"
              />
              <Input
                className="min-w-0"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                maxLength={32}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Salvando…" : project ? "Salvar" : "Criar projeto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
