import type { FastifyReply, FastifyRequest } from "fastify";

import { getEnv } from "@/config/env";

const production = getEnv().NODE_ENV === "production";
// __Host- impede Domain/Path permissivos e evita que outro subdomínio sobrescreva
// o cookie de sessão em produção.
export const SESSION_COOKIE = production ? "__Host-flow_session" : "flow_session";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: production,
    priority: "high" as const,
  };
}

// O cookie é lido e escrito a partir da requisição, e não de um contexto ambiente:
// o backend agora é um processo Fastify próprio, sem o armazenamento por requisição
// que o TanStack Start mantinha por baixo de getCookie/setCookie.
export function readSessionCookie(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE];
}

export function writeSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, cookieOptions());
}
