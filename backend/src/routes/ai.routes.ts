import type { FastifyInstance } from "fastify";
import { runbookAiRequest, taskAiRequest } from "@task-flow/shared/domain/ai-contracts";

import { generateRunbookDraft, generateTaskDraft } from "@/ai/ai-service";
import {
  accessibleProjectFilter,
  assertWorkspaceEditor,
  NotFoundError,
} from "@/auth/authorization";
import { requireSession } from "@/auth/require-session";
import { prisma } from "@/db/client";
import { aiRateLimiter } from "@/security/ai-rate-limit";
import { currentUserId } from "@/workspace/current-user";

async function readAiContext(workspaceId: string, projectId: string | undefined, userId: string) {
  return prisma.$transaction(async (tx) => {
    await assertWorkspaceEditor(tx, userId, workspaceId);
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, labels: { select: { name: true }, orderBy: { name: "asc" } } },
    });
    if (!workspace) throw new NotFoundError();

    const project = projectId
      ? await tx.project.findFirst({
          where: { id: projectId, workspaceId, ...accessibleProjectFilter(userId) },
          select: { name: true },
        })
      : null;
    if (projectId && !project) throw new NotFoundError();

    return {
      workspaceName: workspace.name,
      projectName: project?.name,
      labels: workspace.labels.map((label) => label.name),
    };
  });
}

export function registerAiRoutes(app: FastifyInstance): void {
  app.register(async (authed) => {
    authed.addHook("preHandler", requireSession);

    authed.post("/api/ai/runbook-draft", async (request) => {
      const data = runbookAiRequest.parse(request.body);
      const userId = currentUserId(request);
      const context = await readAiContext(data.workspaceId, data.projectId, userId);
      await aiRateLimiter.consume(userId);
      return generateRunbookDraft(data, context, userId);
    });

    authed.post("/api/ai/task-draft", async (request) => {
      const data = taskAiRequest.parse(request.body);
      const userId = currentUserId(request);
      const context = await readAiContext(data.workspaceId, data.projectId, userId);
      await aiRateLimiter.consume(userId);
      return generateTaskDraft(data, context, userId);
    });
  });
}
