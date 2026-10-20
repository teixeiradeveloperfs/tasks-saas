import type { FastifyInstance } from "fastify";

import { readSessionCookie } from "@/auth/cookie";
import { readCurrentUser } from "@/auth/current-user-read";

export function registerSessionRoutes(app: FastifyInstance): void {
  // Pública de propósito — sem `requireSession`. A guarda de navegação precisa
  // distinguir "sem sessão" de "erro de rede", e um 401 não permite isso.
  app.get("/api/session/me", async (request) => readCurrentUser(readSessionCookie(request)));
}
