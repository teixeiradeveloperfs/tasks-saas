import { createFileRoute, redirect } from "@tanstack/react-router";
import { Check, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { me } from "@/lib/api/auth";
import { enableTwoFactor, startTwoFactorSetup, verifyTwoFactor } from "@/lib/api/security";

const searchSchema = z.object({
  redirect: z.string().optional(),
  reauth: z.literal("1").optional(),
});

export const Route = createFileRoute("/security/two-factor")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ redirect: search.redirect, reauth: search.reauth }),
  loader: async ({ deps }) => {
    const current = await me();
    if (!current.authenticated) {
      throw redirect({ to: "/login", search: { redirect: deps.redirect ?? "/" } });
    }
    if (current.twoFactor === "verified" && deps.reauth !== "1") {
      throw redirect({ to: deps.redirect ?? "/" });
    }
    return current;
  },
  component: TwoFactorPage,
});

function TwoFactorPage() {
  const current = Route.useLoaderData();
  const { redirect: destination } = Route.useSearch();
  const setupRequired = current.twoFactor === "setup_required";
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof startTwoFactorSetup>>>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>();
  const [savedCodes, setSavedCodes] = useState(false);

  useEffect(() => {
    if (!setupRequired) return;
    void startTwoFactorSetup()
      .then(setSetup)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Não foi possível iniciar o 2FA."),
      );
  }, [setupRequired]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = setupRequired ? await enableTwoFactor(code) : await verifyTwoFactor(code);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.recoveryCodes) {
        setRecoveryCodes(result.recoveryCodes);
        return;
      }
      window.location.replace(safeDestination(destination));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível confirmar o código.");
    } finally {
      setBusy(false);
    }
  };

  if (recoveryCodes) {
    return (
      <SecurityShell>
        <Card className="w-full max-w-xl p-5 sm:p-7">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">Guarde seus códigos de recuperação</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cada código funciona uma única vez se você perder o acesso ao autenticador. Eles não
            serão exibidos novamente.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-4 font-mono text-sm sm:grid-cols-5">
            {recoveryCodes.map((recoveryCode) => (
              <span key={recoveryCode}>{recoveryCode}</span>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(recoveryCodes.join("\n"));
                toast.success("Códigos copiados.");
              }}
            >
              <Copy className="h-4 w-4" /> Copiar códigos
            </Button>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={savedCodes}
                onChange={(event) => setSavedCodes(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Salvei os códigos em local seguro
            </label>
          </div>
          <Button
            className="mt-5 w-full"
            disabled={!savedCodes}
            onClick={() => window.location.replace(safeDestination(destination))}
          >
            <Check className="h-4 w-4" /> Continuar para o Taskora
          </Button>
        </Card>
      </SecurityShell>
    );
  }

  return (
    <SecurityShell>
      <Card className="w-full max-w-lg p-5 sm:p-7">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <KeyRound className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">
          {setupRequired ? "Proteja sua conta com 2FA" : "Confirme que é você"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {setupRequired
            ? "O 2FA é obrigatório para proteger tarefas, integrações GitHub e segredos do vault."
            : "Digite o código do seu aplicativo autenticador ou um código de recuperação."}
        </p>

        {setupRequired && (
          <div className="mt-5 rounded-lg border p-4">
            {setup ? (
              <div className="flex flex-col items-center gap-4">
                <img
                  src={setup.qrCodeDataUrl}
                  alt="QR Code para configurar o autenticador"
                  className="h-52 w-52 rounded bg-white p-2"
                />
                <div className="w-full">
                  <p className="text-xs text-muted-foreground">Ou informe esta chave manual:</p>
                  <code className="mt-1 block break-all rounded bg-muted p-2 text-xs">
                    {setup.secret}
                  </code>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparando configuração…
              </div>
            )}
          </div>
        )}

        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="two-factor-code">
              {setupRequired ? "Código de 6 dígitos" : "Código do autenticador ou recuperação"}
            </Label>
            <Input
              id="two-factor-code"
              value={code}
              onChange={(event) => setCode(event.target.value.slice(0, 32))}
              inputMode={setupRequired ? "numeric" : "text"}
              autoComplete="one-time-code"
              placeholder={setupRequired ? "000000" : "000000"}
              className="h-12 text-center font-mono text-lg tracking-[0.3em]"
              autoFocus={!setupRequired}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy || (setupRequired && !setup)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Confirmando…" : setupRequired ? "Ativar 2FA" : "Confirmar acesso"}
          </Button>
        </form>
      </Card>
    </SecurityShell>
  );
}

function safeDestination(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function SecurityShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-muted/30 px-4 py-8">
      <p className="mb-7 text-lg font-semibold tracking-tight">Taskora</p>
      {children}
    </main>
  );
}
