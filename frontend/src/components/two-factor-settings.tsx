import type { TwoFactorStatus } from "@task-flow/shared/domain/security-contracts";
import { Copy, KeyRound, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { regenerateRecoveryCodes, twoFactorStatus } from "@/lib/api/security";

export function TwoFactorSettings() {
  const [status, setStatus] = useState<TwoFactorStatus>();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>();

  useEffect(() => {
    void twoFactorStatus().then(setStatus);
  }, []);

  return (
    <>
      <Card className="mt-6 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Autenticação em duas etapas</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Opcional. Ative para adicionar uma camada extra de proteção à sua conta.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {status
                  ? `${status.recoveryCodesRemaining} códigos de recuperação disponíveis.`
                  : "Carregando situação de segurança…"}
              </p>
            </div>
          </div>
          <Button variant="outline" disabled={!status?.enabled} onClick={() => setOpen(true)}>
            <RefreshCw className="h-4 w-4" /> Gerar novos códigos
          </Button>
        </div>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setCode("");
            setRecoveryCodes(undefined);
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Novos códigos de recuperação
            </DialogTitle>
          </DialogHeader>
          {recoveryCodes ? (
            <>
              <p className="text-sm text-muted-foreground">
                Os códigos anteriores foram invalidados. Guarde estes novos códigos agora.
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-4 font-mono text-sm sm:grid-cols-5">
                {recoveryCodes.map((recoveryCode) => (
                  <span key={recoveryCode}>{recoveryCode}</span>
                ))}
              </div>
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(recoveryCodes.join("\n"));
                  toast.success("Códigos copiados.");
                }}
              >
                <Copy className="h-4 w-4" /> Copiar códigos
              </Button>
            </>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                try {
                  const result = await regenerateRecoveryCodes(code);
                  if (!result.ok) {
                    toast.error(result.message);
                    return;
                  }
                  setRecoveryCodes(result.recoveryCodes);
                  setStatus((current) =>
                    current ? { ...current, recoveryCodesRemaining: 10 } : current,
                  );
                } catch (cause) {
                  toast.error(
                    cause instanceof Error ? cause.message : "Não foi possível gerar os códigos.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p className="text-sm text-muted-foreground">
                Confirme um código atual do autenticador. Todos os códigos de recuperação antigos
                serão invalidados.
              </p>
              <div className="grid gap-2">
                <Label htmlFor="recovery-totp">Código do autenticador</Label>
                <Input
                  id="recovery-totp"
                  value={code}
                  onChange={(event) => setCode(event.target.value.slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="font-mono tracking-[0.3em]"
                  required
                />
              </div>
              <Button disabled={busy || code.length < 6}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Invalidar e gerar novos
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
