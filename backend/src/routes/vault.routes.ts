import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  vaultEntryInput,
  vaultEntryUpdateInput,
} from "@task-flow/shared/domain/security-contracts";

import { requireRecentTwoFactor, requireSession } from "@/auth/require-session";
import { currentUserId } from "@/workspace/current-user";
import {
  createVaultEntry,
  deleteVaultEntry,
  listVaultEntries,
  revealVaultEntry,
  updateVaultEntry,
} from "@/workspace/vault-repository";

const idParams = z.object({ id: z.string().uuid() });

export function registerVaultRoutes(app: FastifyInstance) {
  app.register(async (authed) => {
    authed.addHook("preHandler", requireSession);
    authed.addHook("onSend", async (_request, reply, payload) => {
      reply.header("Cache-Control", "no-store");
      reply.header("Pragma", "no-cache");
      return payload;
    });

    authed.get("/api/workspaces/:id/vault", async (request) => {
      const { id } = idParams.parse(request.params);
      return listVaultEntries(id, currentUserId(request));
    });

    authed.post("/api/workspaces/:id/vault", async (request) => {
      requireRecentTwoFactor(request);
      const { id } = idParams.parse(request.params);
      return createVaultEntry(id, vaultEntryInput.parse(request.body), currentUserId(request));
    });

    authed.patch("/api/vault/:id", async (request) => {
      requireRecentTwoFactor(request);
      const { id } = idParams.parse(request.params);
      return updateVaultEntry(
        id,
        vaultEntryUpdateInput.parse(request.body),
        currentUserId(request),
      );
    });

    authed.post("/api/vault/:id/reveal", async (request) => {
      requireRecentTwoFactor(request);
      const { id } = idParams.parse(request.params);
      return revealVaultEntry(id, currentUserId(request));
    });

    authed.delete("/api/vault/:id", async (request, reply) => {
      requireRecentTwoFactor(request);
      const { id } = idParams.parse(request.params);
      await deleteVaultEntry(id, currentUserId(request));
      reply.code(204).send();
    });
  });
}
