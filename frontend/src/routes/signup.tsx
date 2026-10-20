import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { signUp } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthDivider, GoogleAuthButton } from "@/components/google-auth-button";

const signupSearch = z.object({
  googleError: z.enum(["failed", "cancelled"]).optional(),
});

export const Route = createFileRoute("/signup")({
  validateSearch: signupSearch,
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { googleError } = Route.useSearch();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signUp({ data: { name, email, password } });
      if (!result.ok) setError(result.message);
      else await navigate({ to: "/" });
    } catch {
      setError("Não foi possível criar a conta agora.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-4">
      <Card className="w-full max-w-md p-5 sm:p-6">
        <h1 className="text-2xl font-semibold">Criar conta</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">Comece seu workspace no Taskora.</p>
        <form onSubmit={submit} className="grid gap-4">
          <GoogleAuthButton from="signup" />
          <AuthDivider />
          {googleError && (
            <p className="text-sm text-destructive">
              {googleError === "cancelled"
                ? "O cadastro com Google foi cancelado."
                : "Não foi possível cadastrar com o Google. Tente novamente."}
            </p>
          )}
          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label>Senha</Label>
            <Input
              type="password"
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">Use pelo menos 12 caracteres.</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={loading}>{loading ? "Criando…" : "Criar conta"}</Button>
          <p className="text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link className="font-medium transition-colors hover:text-foreground" to="/login">
              Entrar
            </Link>
          </p>
        </form>
      </Card>
    </main>
  );
}
