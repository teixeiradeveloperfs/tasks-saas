import { Link, createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { signOut } from "@/lib/api/auth";
import { acceptInvite, acceptInviteAuthenticated, readInvite } from "@/lib/api/invite";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";

export const Route = createFileRoute("/invite/$token")({ component: InvitePage });

function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  const [invite, setInvite] = useState<Awaited<ReturnType<typeof readInvite>> | undefined>();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    readInvite({ data: { token } }).then(setInvite);
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!invite) return;
    if (!invite.hasAccount && password.length < 12) {
      setError("A senha precisa ter pelo menos 12 caracteres.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = invite.hasAccount
        ? await acceptInviteAuthenticated({ data: { token, role } })
        : await acceptInvite({ data: { token, name, role, password } });
      await navigate({
        to: "/workspace/$workspaceId",
        params: { workspaceId: result.workspaceId },
      });
    } catch (cause) {
      if (!(cause instanceof ApiError)) {
        setError("Não foi possível acessar o servidor. Tente novamente.");
      } else if (cause.status === 404) {
        setError("Este convite já foi utilizado, substituído ou expirou.");
      } else {
        // Não esconda falhas de validação, origem, rate limit ou servidor sob a
        // mensagem enganosa de token expirado.
        setError(cause.message || "Não foi possível aceitar o convite.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-4">
      <Card className="w-full max-w-md p-5 sm:p-6">
        <div className="mb-8 flex justify-center"></div>
        <h1 className="text-2xl font-semibold">Convite para o Taskora</h1>
        {invite === undefined ? (
          <p className="mt-2 text-sm text-muted-foreground">Carregando convite…</p>
        ) : invite === null ? (
          <p className="mt-2 text-sm text-muted-foreground">Convite inválido ou expirado.</p>
        ) : invite.hasAccount && !invite.authenticatedAsInvitee ? (
          <div className="mt-6 grid gap-4">
            <p className="text-sm text-muted-foreground">
              Você foi convidado para <strong>{invite.workspaceName}</strong> como {invite.email}.
            </p>
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Esta conta já existe. Entre com ela — usando senha ou Google — para aceitar sem criar
              outro cadastro.
            </p>
            {invite.authenticated ? (
              <Button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    await signOut();
                    window.location.assign(
                      `/login?redirect=${encodeURIComponent(`/invite/${token}`)}`,
                    );
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {loading ? "Saindo…" : "Trocar de conta"}
              </Button>
            ) : (
              <Button asChild>
                <Link to="/login" search={{ redirect: `/invite/${token}` }}>
                  Entrar para aceitar
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 grid gap-4">
            <p className="text-sm text-muted-foreground">
              Você foi convidado para <strong>{invite.workspaceName}</strong> como {invite.email}.
            </p>
            {invite.hasAccount ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Você entrou com a conta correta. Confirme o aceite; seu perfil não será alterado.
              </p>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="invite-name">Nome</Label>
                <Input
                  id="invite-name"
                  value={name}
                  onChange={(event) => setName(event.target.value.slice(0, 60))}
                  maxLength={60}
                  required
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="invite-role">Cargo / função (opcional)</Label>
              <Input
                id="invite-role"
                value={role}
                onChange={(event) => setRole(event.target.value.slice(0, 60))}
                placeholder="Ex.: Designer, Desenvolvedor…"
                maxLength={60}
              />
            </div>
            {!invite.hasAccount && (
              <div className="grid gap-2">
                <Label htmlFor="invite-password">Crie sua senha</Label>
                <Input
                  id="invite-password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError(null);
                  }}
                  minLength={12}
                  maxLength={200}
                  aria-invalid={Boolean(error)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Use pelo menos 12 caracteres. {password.length}/12
                </p>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button disabled={loading}>{loading ? "Entrando…" : "Aceitar convite"}</Button>
          </form>
        )}
      </Card>
    </main>
  );
}
