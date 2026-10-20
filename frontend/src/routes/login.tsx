import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { me, signIn } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthDivider, GoogleAuthButton } from "@/components/google-auth-button";

const loginSearch = z.object({
  redirect: z.string().optional(),
  googleError: z.enum(["failed", "cancelled"]).optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearch,
  beforeLoad: async ({ search }: { search: { redirect?: string; googleError?: string } }) => {
    const current = await me();
    if (current.authenticated) {
      throw redirect({ to: search.redirect ?? "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect: destination, googleError } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signIn({ data: { email, password } });
      if (!result.ok) setError(result.message);
      else await navigate({ to: destination ?? "/" });
    } catch {
      setError("Não foi possível entrar agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Entrar" subtitle="Acesse seus workspaces no Taskora.">
      <form onSubmit={submit} className="grid gap-4">
        <GoogleAuthButton from="login" returnTo={destination} />
        <AuthDivider />
        {googleError && (
          <p className="text-sm text-destructive">
            {googleError === "cancelled"
              ? "O acesso com Google foi cancelado."
              : "Não foi possível entrar com o Google. Tente novamente."}
          </p>
        )}
        <Field label="E-mail">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Senha">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button disabled={loading}>{loading ? "Entrando…" : "Entrar"}</Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link
            className="font-medium transition-colors hover:text-foreground"
            to="/forgot-password"
          >
            Esqueci minha senha
          </Link>
        </p>
        <p className="text-center text-sm text-muted-foreground">
          Ainda não tem conta?{" "}
          <Link className="font-medium transition-colors hover:text-foreground" to="/signup">
            Criar cadastro
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-4">
      <Card className="w-full max-w-md p-5 sm:p-6">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">{subtitle}</p>
        {children}
      </Card>
    </main>
  );
}
