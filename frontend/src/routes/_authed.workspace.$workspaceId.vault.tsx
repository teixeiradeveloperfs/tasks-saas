import type {
  VaultEntryInput,
  VaultEntrySummary,
} from "@task-flow/shared/domain/security-contracts";
import { createFileRoute } from "@tanstack/react-router";
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ShareDialog } from "@/components/share-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createVaultEntry,
  deleteVaultEntry,
  listVaultEntries,
  revealVaultEntry,
  updateVaultEntry,
} from "@/lib/api/security";

export const Route = createFileRoute("/_authed/workspace/$workspaceId/vault")({
  head: () => ({ meta: [{ title: "Vault — Taskora" }] }),
  component: VaultPage,
});

const categoryLabels: Record<VaultEntryInput["category"], string> = {
  credential: "Credencial",
  token: "Token",
  ssh_key: "Chave SSH",
  environment: "Variáveis de ambiente",
  note: "Nota segura",
};

function VaultPage() {
  const { workspaceId } = Route.useParams();
  const [entries, setEntries] = useState<VaultEntrySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<VaultEntrySummary | null>();
  const [revealed, setRevealed] = useState<Awaited<ReturnType<typeof revealVaultEntry>>>();
  const [revealingId, setRevealingId] = useState<string>();
  const [sharing, setSharing] = useState<VaultEntrySummary>();

  const refresh = useCallback(async () => {
    try {
      setEntries(await listVaultEntries(workspaceId));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível carregar o vault.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    setLoading(true);
    setRevealed(undefined);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!revealed) return;
    const timer = window.setTimeout(() => setRevealed(undefined), 60_000);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;
    return entries.filter((entry) =>
      [entry.name, entry.description, entry.username, entry.url, categoryLabels[entry.category]]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized)),
    );
  }, [entries, query]);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Segurança
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <LockKeyhole className="h-6 w-6 text-primary" /> Vault
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Segredos criptografados do workspace. Somente proprietários e administradores podem
              listar, revelar ou alterar estes itens.
            </p>
          </div>
          <Button onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" /> Novo segredo
          </Button>
        </div>

        <div className="relative mt-6 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar no vault…"
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando vault…
          </div>
        ) : filtered.length === 0 ? (
          <Card className="mt-6 flex flex-col items-center p-10 text-center">
            <KeyRound className="h-9 w-9 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">
              {entries.length === 0 ? "O vault ainda está vazio" : "Nenhum item encontrado"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {entries.length === 0
                ? "Salve tokens, credenciais, chaves SSH e variáveis com segurança."
                : "Tente buscar por outro nome ou categoria."}
            </p>
          </Card>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((entry) => (
              <Card key={entry.id} className="flex min-w-0 flex-col p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                      {categoryLabels[entry.category]}
                    </span>
                    <h2 className="mt-3 truncate font-semibold">{entry.name}</h2>
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => setSharing(entry)}>
                      <Share2 className="h-4 w-4" />
                      <span className="sr-only">Compartilhar {entry.name}</span>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(entry)}>
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Editar {entry.name}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (!window.confirm(`Excluir “${entry.name}” permanentemente?`)) return;
                        try {
                          await deleteVaultEntry(entry.id);
                          setEntries((current) => current.filter((item) => item.id !== entry.id));
                          if (revealed?.id === entry.id) setRevealed(undefined);
                          toast.success("Item removido do vault.");
                        } catch (cause) {
                          toast.error(
                            cause instanceof Error ? cause.message : "Não foi possível excluir.",
                          );
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Excluir {entry.name}</span>
                    </Button>
                  </div>
                </div>
                {entry.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {entry.description}
                  </p>
                )}
                {entry.username && (
                  <p className="mt-3 truncate text-xs text-muted-foreground">
                    Usuário: <span className="text-foreground">{entry.username}</span>
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between gap-2 pt-5">
                  {entry.url ? (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" /> Abrir referência
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Atualizado por {entry.updatedBy}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={revealingId === entry.id}
                    onClick={async () => {
                      setRevealingId(entry.id);
                      try {
                        setRevealed(await revealVaultEntry(entry.id));
                      } catch (cause) {
                        toast.error(
                          cause instanceof Error ? cause.message : "Não foi possível revelar.",
                        );
                      } finally {
                        setRevealingId(undefined);
                      }
                    }}
                  >
                    {revealingId === entry.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    Revelar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <VaultEntryDialog
        workspaceId={workspaceId}
        entry={editing}
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        onSaved={(entry) => {
          setEntries((current) => {
            const exists = current.some((item) => item.id === entry.id);
            return exists
              ? current.map((item) => (item.id === entry.id ? entry : item))
              : [entry, ...current];
          });
          setEditing(undefined);
        }}
      />
      {sharing && (
        <ShareDialog
          kind="vault"
          itemId={sharing.id}
          itemName={sharing.name}
          open
          onOpenChange={(open) => !open && setSharing(undefined)}
        />
      )}

      <Dialog open={Boolean(revealed)} onOpenChange={(open) => !open && setRevealed(undefined)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" /> {revealed?.name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            O valor será ocultado automaticamente em 60 segundos. Esta revelação foi registrada na
            auditoria do workspace.
          </p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-muted/40 p-4 font-mono text-sm">
            {revealed?.secret}
          </pre>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={async () => {
                if (!revealed) return;
                await navigator.clipboard.writeText(revealed.secret);
                toast.success(
                  "Segredo copiado. Limparemos a área de transferência em 30 segundos.",
                );
                const copied = revealed.secret;
                window.setTimeout(async () => {
                  try {
                    if ((await navigator.clipboard.readText()) === copied) {
                      await navigator.clipboard.writeText("");
                    }
                  } catch {
                    // O navegador pode proibir a leitura fora de uma interação do usuário.
                  }
                }, 30_000);
              }}
            >
              <Copy className="h-4 w-4" /> Copiar por 30 segundos
            </Button>
            <Button variant="outline" onClick={() => setRevealed(undefined)}>
              <EyeOff className="h-4 w-4" /> Ocultar agora
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function VaultEntryDialog({
  workspaceId,
  entry,
  open,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  entry: VaultEntrySummary | null | undefined;
  open: boolean;
  onClose: () => void;
  onSaved: (entry: VaultEntrySummary) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [username, setUsername] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<VaultEntryInput["category"]>("credential");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(entry?.name ?? "");
    setDescription(entry?.description ?? "");
    setUsername(entry?.username ?? "");
    setUrl(entry?.url ?? "");
    setCategory(entry?.category ?? "credential");
    setSecret("");
    setShowSecret(false);
  }, [entry, open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "Editar item do vault" : "Novo item no vault"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!entry && !secret) return;
            setSaving(true);
            try {
              const common = {
                name,
                description: description || undefined,
                username: username || undefined,
                url: url || undefined,
                category,
              };
              const saved = entry
                ? await updateVaultEntry(entry.id, { ...common, ...(secret ? { secret } : {}) })
                : await createVaultEntry(workspaceId, { ...common, secret });
              onSaved(saved);
              toast.success(entry ? "Item atualizado." : "Segredo salvo no vault.");
            } catch (cause) {
              toast.error(cause instanceof Error ? cause.message : "Não foi possível salvar.");
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="vault-name">Nome</Label>
            <Input
              id="vault-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="vault-category">Categoria</Label>
            <select
              id="vault-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as VaultEntryInput["category"])}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="vault-username">Usuário ou identificação</Label>
            <Input
              id="vault-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="vault-url">URL de referência</Label>
            <Input
              id="vault-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="vault-description">Descrição</Label>
            <Textarea
              id="vault-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="vault-secret">
              Segredo{" "}
              {entry && <span className="font-normal text-muted-foreground">(opcional)</span>}
            </Label>
            <div className="relative">
              <Textarea
                id="vault-secret"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                rows={5}
                required={!entry}
                autoComplete="new-password"
                className={
                  !showSecret
                    ? "font-mono text-transparent caret-foreground [text-shadow:0_0_8px_hsl(var(--foreground))]"
                    : "font-mono"
                }
                placeholder={
                  entry ? "Deixe vazio para manter o valor atual" : "Cole o valor secreto"
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2"
                onClick={() => setShowSecret((current) => !current)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="sr-only">{showSecret ? "Ocultar" : "Mostrar"} segredo</span>
              </Button>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={saving || !name.trim() || (!entry && !secret)}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Salvando…" : "Salvar no vault"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
