import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-4">
      <Card className="w-full max-w-md p-5 sm:p-6">
        <h1 className="text-2xl font-semibold">Recuperar senha</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Se houver uma conta com esse e-mail, enviaremos as instruções.
        </p>
        {sent ? (
          <p className="text-sm">Se houver uma conta com esse e-mail, enviaremos as instruções.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button>Enviar instruções</Button>
          </form>
        )}
        <p className="mt-5 text-center text-sm text-muted-foreground">
          <Link className="font-medium transition-colors hover:text-foreground" to="/login">
            Voltar para entrar
          </Link>
        </p>
      </Card>
    </main>
  );
}
