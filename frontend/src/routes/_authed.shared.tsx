import type { SharedItems, SharedVaultReveal } from "@task-flow/shared/domain/security-contracts";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Eye, KeyRound, Loader2, Share2, TerminalSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listSharedItems, revealSharedVaultEntry } from "@/lib/api/security";

export const Route = createFileRoute("/_authed/shared")({
  head: () => ({ meta: [{ title: "Compartilhados comigo — Taskora" }] }),
  component: SharedPage,
});

function SharedPage() {
  const [items, setItems] = useState<SharedItems>();
  const [revealed, setRevealed] = useState<SharedVaultReveal>();
  const [revealingId, setRevealingId] = useState<string>();

  useEffect(() => {
    void listSharedItems()
      .then(setItems)
      .catch((cause) =>
        toast.error(cause instanceof Error ? cause.message : "Não foi possível carregar os itens."),
      );
  }, []);

  useEffect(() => {
    if (!revealed) return;
    const timer = window.setTimeout(() => setRevealed(undefined), 60_000);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-8">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Acesso</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Share2 className="h-6 w-6 text-primary" /> Compartilhados comigo
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Runbooks e segredos liberados diretamente para sua conta, sem acesso ao restante do
          workspace.
        </p>

        {!items ? (
          <div className="flex justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : items.runbooks.length === 0 && items.vaultEntries.length === 0 ? (
          <Card className="mt-6 p-10 text-center">
            <Share2 className="mx-auto h-9 w-9 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">Nada compartilhado ainda</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Os itens liberados diretamente para o seu e-mail aparecerão aqui.
            </p>
          </Card>
        ) : (
          <div className="mt-8 space-y-10">
            <section>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <TerminalSquare className="h-5 w-5" /> Runbooks
              </h2>
              <div className="mt-3 grid gap-4 xl:grid-cols-2">
                {items.runbooks.map((item) => (
                  <Card key={item.shareId} className="min-w-0 overflow-hidden">
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{item.runbook.category}</Badge>
                        <Badge variant="secondary">{item.runbook.environment}</Badge>
                      </div>
                      <h3 className="mt-3 font-semibold">{item.runbook.title}</h3>
                      {item.runbook.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.runbook.description}
                        </p>
                      )}
                      <p className="mt-3 text-xs text-muted-foreground">
                        {item.workspace.name} · compartilhado por {item.sharedBy}
                      </p>
                    </div>
                    <div className="space-y-px border-t bg-border">
                      {item.runbook.steps.map((step, index) => (
                        <div key={step.id} className="bg-card p-4">
                          <p className="text-sm font-medium">
                            {index + 1}. {step.title}
                          </p>
                          {step.explanation && (
                            <p className="mt-1 text-xs text-muted-foreground">{step.explanation}</p>
                          )}
                          <div className="relative mt-3 overflow-hidden rounded-lg bg-slate-950 text-slate-100">
                            <pre className="overflow-x-auto p-3 pr-12 text-xs">
                              <code>{step.command}</code>
                            </pre>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1 text-slate-300 hover:bg-white/10 hover:text-white"
                              onClick={async () => {
                                await navigator.clipboard.writeText(step.command);
                                toast.success("Comando copiado.");
                              }}
                            >
                              <Copy className="h-4 w-4" />
                              <span className="sr-only">Copiar comando</span>
                            </Button>
                          </div>
                          {step.expectedResult && (
                            <p className="mt-2 flex gap-2 text-xs text-muted-foreground">
                              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />{" "}
                              {step.expectedResult}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
              {items.runbooks.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">Nenhum runbook compartilhado.</p>
              )}
            </section>

            <section>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <KeyRound className="h-5 w-5" /> Vault
              </h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.vaultEntries.map((entry) => (
                  <Card key={entry.shareId} className="flex min-w-0 flex-col p-4 sm:p-5">
                    <Badge variant="outline" className="w-fit">
                      {entry.category}
                    </Badge>
                    <h3 className="mt-3 truncate font-semibold">{entry.name}</h3>
                    {entry.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {entry.description}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">
                      {entry.workspaceName} · compartilhado por {entry.sharedBy}
                    </p>
                    <Button
                      className="mt-5"
                      variant="outline"
                      disabled={revealingId === entry.id}
                      onClick={async () => {
                        setRevealingId(entry.id);
                        try {
                          setRevealed(await revealSharedVaultEntry(entry.id));
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
                  </Card>
                ))}
              </div>
              {items.vaultEntries.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">Nenhum segredo compartilhado.</p>
              )}
            </section>
          </div>
        )}
      </div>

      <Dialog open={Boolean(revealed)} onOpenChange={(open) => !open && setRevealed(undefined)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{revealed?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            O valor será ocultado em 60 segundos e a revelação foi registrada na auditoria.
          </p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-muted/40 p-4 font-mono text-sm">
            {revealed?.secret}
          </pre>
          <Button
            onClick={async () => {
              if (!revealed) return;
              await navigator.clipboard.writeText(revealed.secret);
              toast.success("Segredo copiado.");
            }}
          >
            <Copy className="h-4 w-4" /> Copiar
          </Button>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
