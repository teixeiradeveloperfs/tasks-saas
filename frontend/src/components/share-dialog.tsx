import type { ItemShare } from "@task-flow/shared/domain/security-contracts";
import { Loader2, Mail, Share2, Trash2, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listItemShares, revokeItemShare, shareItem, type ShareableKind } from "@/lib/api/security";

export function ShareDialog({
  kind,
  itemId,
  itemName,
  open,
  onOpenChange,
}: {
  kind: ShareableKind;
  itemId: string;
  itemName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [shares, setShares] = useState<ItemShare[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void listItemShares(kind, itemId)
      .then(setShares)
      .catch((cause) =>
        toast.error(cause instanceof Error ? cause.message : "Não foi possível listar os acessos."),
      )
      .finally(() => setLoading(false));
  }, [itemId, kind, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    try {
      const saved = await shareItem(kind, itemId, email);
      setShares((current) => [saved, ...current.filter((share) => share.id !== saved.id)]);
      setEmail("");
      toast.success("Acesso compartilhado.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível compartilhar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" /> Compartilhar
          </DialogTitle>
          <DialogDescription>
            “{itemName}” será compartilhado somente para leitura com uma conta já cadastrada. O
            acesso pode ser revogado a qualquer momento.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-2">
          <Label htmlFor="share-email">E-mail do usuário</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="share-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="pessoa@empresa.com"
                className="pl-9"
                required
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              Compartilhar
            </Button>
          </div>
        </form>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Pessoas com acesso
          </p>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : shares.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Este item ainda não foi compartilhado.
            </p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {shares.map((share) => (
                <div key={share.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                    {share.user.avatarUrl ? (
                      <img
                        src={share.user.avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <UserRound className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{share.user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{share.user.email}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Revogar acesso de ${share.user.name}`}
                    onClick={async () => {
                      try {
                        await revokeItemShare(kind, itemId, share.id);
                        setShares((current) => current.filter((item) => item.id !== share.id));
                        toast.success("Acesso revogado.");
                      } catch (cause) {
                        toast.error(
                          cause instanceof Error ? cause.message : "Não foi possível revogar.",
                        );
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
