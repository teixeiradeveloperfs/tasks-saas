import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { shareWithUserInput } from "@task-flow/shared/domain/security-contracts";

import { requireRecentTwoFactor, requireSession } from "@/auth/require-session";
import { currentUserId } from "@/workspace/current-user";
import {
  listItemShares,
  listSharedItems,
  revealSharedVaultEntry,
  revokeItemShare,
  shareItem,
} from "@/workspace/sharing-repository";

const itemParams = z.object({ id: z.string().uuid() });
const shareParams = z.object({ id: z.string().uuid(), shareId: z.string().uuid() });

export function registerSharingRoutes(app: FastifyInstance) {
  app.register(async (authed) => {
    authed.addHook("preHandler", requireSession);

    for (const kind of ["runbook", "vault"] as const) {
      authed.get(`/api/${kind}/:id/shares`, async (request) => {
        const { id } = itemParams.parse(request.params);
        return listItemShares(kind, id, currentUserId(request));
      });
      authed.post(`/api/${kind}/:id/shares`, async (request) => {
        if (kind === "vault") requireRecentTwoFactor(request);
        const { id } = itemParams.parse(request.params);
        const { email } = shareWithUserInput.parse(request.body);
        return shareItem(kind, id, email, currentUserId(request));
      });
      authed.delete(`/api/${kind}/:id/shares/:shareId`, async (request, reply) => {
        if (kind === "vault") requireRecentTwoFactor(request);
        const { id, shareId } = shareParams.parse(request.params);
        await revokeItemShare(kind, id, shareId, currentUserId(request));
        reply.code(204).send();
      });
    }

    authed.get("/api/shared", async (request) => listSharedItems(currentUserId(request)));
    authed.post("/api/shared/vault/:id/reveal", async (request) => {
      requireRecentTwoFactor(request);
      const { id } = itemParams.parse(request.params);
      return revealSharedVaultEntry(id, currentUserId(request));
    });
  });
}
