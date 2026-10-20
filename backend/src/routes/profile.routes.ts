import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  toggleIntegrationInput,
  updateIntegrationConfigInput,
  updateProfileInput,
} from "@task-flow/shared/domain/auth-contracts";

import { requireSession } from "@/auth/require-session";
import { currentUserId } from "@/workspace/current-user";
import * as repository from "@/workspace/repository";

const params = (...keys: string[]) =>
  z.object(Object.fromEntries(keys.map((k) => [k, z.string()])));

export function registerProfileRoutes(app: FastifyInstance): void {
  app.register(async (authed) => {
    authed.addHook("preHandler", requireSession);

    authed.patch("/api/profile", async (request) => {
      const data = updateProfileInput.parse(request.body);
      return repository.updateProfile(currentUserId(request), data);
    });

    authed.patch("/api/profile/pinned-workspaces/:workspaceId", async (request) => {
      const { workspaceId } = params("workspaceId").parse(request.params);
      return repository.togglePinWorkspace(currentUserId(request), workspaceId);
    });

    authed.patch("/api/profile/pinned-tasks/:taskId", async (request) => {
      const { taskId } = params("taskId").parse(request.params);
      return repository.togglePinTask(currentUserId(request), taskId);
    });

    authed.post("/api/profile/notifications/read", async (request) =>
      repository.markNotificationsRead(currentUserId(request)),
    );

    authed.patch("/api/workspaces/:workspaceId/integrations", async (request) => {
      const { workspaceId } = params("workspaceId").parse(request.params);
      const data = toggleIntegrationInput.parse(request.body);
      return repository.toggleIntegration(workspaceId, data, currentUserId(request));
    });

    authed.patch(
      "/api/workspaces/:workspaceId/integrations/:integrationId/config",
      async (request) => {
        const { workspaceId, integrationId } = params("workspaceId", "integrationId").parse(
          request.params,
        );
        const { config } = updateIntegrationConfigInput.parse(request.body);
        return repository.updateIntegrationConfig(
          workspaceId,
          integrationId,
          config,
          currentUserId(request),
        );
      },
    );
  });
}
