import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  acceptInviteInput,
  createInviteInput,
  inviteToken,
} from "@task-flow/shared/domain/auth-contracts";

import { readSessionCookie, writeSessionCookie } from "@/auth/cookie";
import { requireSession } from "@/auth/require-session";
import { readSession } from "@/auth/session";
import { getEnv } from "@/config/env";
import { requestHeaders } from "@/http/request-headers";
import { resolveClientIp } from "@/security/client-ip";
import { inviteAcceptRateLimiter } from "@/security/login-rate-limit";
import { currentUserId } from "@/workspace/current-user";
import {
  acceptWorkspaceInvite,
  acceptWorkspaceInviteAsUser,
  createWorkspaceInvite,
  getInvite,
} from "@/workspace/invites";

export function registerInviteRoutes(app: FastifyInstance): void {
  app.post("/api/invites", { preHandler: requireSession }, async (request) => {
    const data = createInviteInput.parse(request.body);
    const invite = await createWorkspaceInvite({ ...data, invitedById: currentUserId(request) });
    return {
      ...invite,
      // O link não pode depender do host pelo qual o administrador abriu o app
      // (www, IP ou outro alias), pois o CSRF aceita somente a origem canônica.
      url: new URL(invite.path, getEnv().APP_ORIGIN).toString(),
    };
  });

  // Sem sessão de propósito: quem lê ou aceita um convite ainda não tem conta.
  app.get("/api/invites/:token", async (request) => {
    const { token } = z.object({ token: inviteToken }).parse(request.params);
    const sessionToken = readSessionCookie(request);
    const session = sessionToken ? await readSession(sessionToken) : null;
    return getInvite(token, session?.user.id);
  });

  app.post(
    "/api/invites/:token/accept-authenticated",
    { preHandler: requireSession },
    async (request) => {
      const { token } = z.object({ token: inviteToken }).parse(request.params);
      const { role } = acceptInviteInput.pick({ role: true }).parse(request.body);
      const result = await acceptWorkspaceInviteAsUser({
        token,
        role,
        userId: currentUserId(request),
      });
      return { workspaceId: result.workspaceId };
    },
  );

  app.post("/api/invites/:token/accept", async (request, reply) => {
    const { token } = z.object({ token: inviteToken }).parse(request.params);
    const clientIp = resolveClientIp(requestHeaders(request), getEnv().TRUSTED_PROXY_HEADER);
    const rateLimit = await inviteAcceptRateLimiter.consume({ email: token, clientIp });
    if (!rateLimit.allowed) {
      return reply
        .code(429)
        .header("retry-after", String(Math.ceil(rateLimit.retryAfterMs / 1000)))
        .send({ error: "Muitas tentativas. Tente novamente mais tarde." });
    }
    const data = acceptInviteInput.omit({ token: true }).parse(request.body);
    const result = await acceptWorkspaceInvite({ token, ...data });
    writeSessionCookie(reply, result.token, result.expiresAt);
    return { workspaceId: result.workspaceId };
  });
}
