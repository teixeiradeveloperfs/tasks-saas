import { useNavigate } from "@tanstack/react-router";
import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { prepareSquareImage } from "@/lib/image-upload";
import { useStore, type Workspace } from "@/state/workspace-store";

const COLORS = ["#0086f2", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace?: Workspace;
}

export function WorkspaceDialog({ open, onOpenChange, workspace }: Props) {
  const createWorkspace = useStore((s) => s.createWorkspace);
  const updateWorkspace = useStore((s) => s.updateWorkspace);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editing = Boolean(workspace);

  useEffect(() => {
    if (!open) return;
    setName(workspace?.name ?? "");
    setDescription(workspace?.description ?? "");
    setColor(workspace?.color ?? COLORS[0]);
    setImageUrl(workspace?.imageUrl);
    setError(null);
  }, [open, workspace]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving || processingImage) return;
    setSaving(true);
    setError(null);
    try {
      const data = {
        name: name.trim(),
        description: description.trim(),
        color,
        imageUrl,
      };
      const ws = workspace
        ? await updateWorkspace(workspace.id, { ...data, imageUrl: imageUrl ?? null })
        : await createWorkspace(data);
      onOpenChange(false);
      if (!workspace) {
        await navigate({ to: "/workspace/$workspaceId", params: { workspaceId: ws.id } });
      }
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Não foi possível salvar o workspace. Tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar workspace" : "Novo workspace"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Atualize o nome, a foto e a identidade deste workspace."
                : "Crie um espaço isolado para cada cliente ou empresa."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Foto do workspace</Label>
              <div className="flex items-center gap-3">
                <WorkspaceAvatar
                  workspace={{ name: name || "Workspace", color, imageUrl }}
                  className="h-16 w-16 rounded-xl text-xl"
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      setProcessingImage(true);
                      setError(null);
                      try {
                        setImageUrl(await prepareSquareImage(file));
                      } catch (cause) {
                        setError(
                          cause instanceof Error ? cause.message : "Não foi possível ler a imagem.",
                        );
                      } finally {
                        setProcessingImage(false);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={processingImage || saving}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {processingImage ? "Processando…" : imageUrl ? "Trocar foto" : "Adicionar foto"}
                  </Button>
                  {imageUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={processingImage || saving}
                      onClick={() => setImageUrl(undefined)}
                    >
                      <Trash2 className="h-4 w-4" /> Remover
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                JPG, PNG ou WebP. A foto será recortada em formato quadrado.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-name">Nome</Label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Acme Inc."
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-desc">Descrição (opcional)</Label>
              <Textarea
                id="ws-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve contexto do workspace"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="h-7 w-7 rounded-md ring-offset-2 ring-offset-background transition data-[active=true]:ring-2 data-[active=true]:ring-ring"
                    data-active={color === c}
                    style={{ backgroundColor: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || processingImage || !name.trim()}>
              {saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
