import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  automationInput,
  automationPatch,
  boardColumnInput,
  customFieldInput,
  customFieldPatch,
  docCreateInput,
  docPatch,
  goalInput,
  goalPatch,
  labelInput,
  labelPatch,
  memberPatch,
  projectInput,
  projectPatch,
  runbookInput,
  runbookPatch,
  sprintInput,
  sprintPatch,
  workspaceInput,
  workspacePatch,
  whiteboardCreateInput,
  whiteboardPatch,
} from "@task-flow/shared/domain/workspace-contracts";

import { requireSession } from "@/auth/require-session";
import { currentUserId } from "@/workspace/current-user";
import { readBoardDataForUser, readWorkspaceTasksPage } from "@/workspace/repository";
import * as repository from "@/workspace/workspace-repository";
import * as whiteboards from "@/workspace/whiteboard-repository";
import { listAuditEvents, undoAuditEvent } from "@/workspace/audit-repository";
import { assertWorkspaceMember } from "@/auth/authorization";
import { prisma } from "@/db/client";
import { subscribeWorkspace } from "@/workspace/realtime";
import { publishWorkspaceChange } from "@/workspace/realtime";
import {
  createRunbook,
  deleteRunbook,
  toggleRunbookFavorite,
  toggleRunbookStep,
  updateRunbook,
} from "@/workspace/runbook-repository";

const params = (...keys: string[]) =>
  z.object(Object.fromEntries(keys.map((k) => [k, z.string()])));

export function registerWorkspaceRoutes(app: FastifyInstance): void {
  app.register(async (authed) => {
    authed.addHook("preHandler", requireSession);
    authed.addHook("onSend", async (request, reply, payload) => {
      if (request.method === "GET" || reply.statusCode >= 400 || typeof payload !== "string") {
        return payload;
      }
      try {
        const body = JSON.parse(payload) as {
          id?: string;
          workspaceId?: string;
          workspace?: { id?: string };
          members?: unknown[];
        };
        const pathWorkspaceId = request.url.match(/^\/api\/workspaces\/([^/?]+)/)?.[1];
        const directWorkspaceId = body.members ? body.id : undefined;
        const workspaceId =
          body.workspaceId ?? body.workspace?.id ?? pathWorkspaceId ?? directWorkspaceId;
        if (workspaceId) publishWorkspaceChange(workspaceId);
      } catch {
        // Respostas vazias não carregam um workspace para invalidar.
      }
      return payload;
    });

    authed.get("/api/board", async (request) => readBoardDataForUser(currentUserId(request)));

    authed.get("/api/workspaces/:id/tasks", async (request) => {
      const { id } = params("id").parse(request.params);
      const query = z
        .object({
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(100),
        })
        .parse(request.query);
      return readWorkspaceTasksPage(id, currentUserId(request), query.cursor, query.limit);
    });

    authed.post("/api/workspaces", async (request) => {
      const data = workspaceInput.parse(request.body);
      return repository.createWorkspace(data, currentUserId(request));
    });

    authed.patch("/api/workspaces/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      const patch = workspacePatch.parse(request.body);
      return repository.updateWorkspace(id, patch, currentUserId(request));
    });

    authed.delete("/api/workspaces/:id", async (request, reply) => {
      const { id } = params("id").parse(request.params);
      await repository.deleteWorkspace(id, currentUserId(request));
      reply.code(204).send();
    });

    authed.post("/api/workspaces/:id/projects", async (request) => {
      const { id } = params("id").parse(request.params);
      return repository.createProject(id, projectInput.parse(request.body), currentUserId(request));
    });

    authed.patch("/api/projects/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      return repository.updateProject(id, projectPatch.parse(request.body), currentUserId(request));
    });

    authed.post("/api/projects/:id/columns", async (request) => {
      const { id } = params("id").parse(request.params);
      return repository.createBoardColumn(
        id,
        boardColumnInput.parse(request.body),
        currentUserId(request),
      );
    });

    authed.post("/api/workspaces/:id/runbooks", async (request) => {
      const { id: workspaceId } = params("id").parse(request.params);
      return createRunbook(workspaceId, runbookInput.parse(request.body), currentUserId(request));
    });

    authed.patch("/api/runbooks/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      return updateRunbook(id, runbookPatch.parse(request.body), currentUserId(request));
    });

    authed.delete("/api/runbooks/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      return deleteRunbook(id, currentUserId(request));
    });

    authed.patch("/api/runbooks/:id/favorite", async (request) => {
      const { id } = params("id").parse(request.params);
      return toggleRunbookFavorite(id, currentUserId(request));
    });

    authed.patch("/api/runbook-steps/:id/toggle", async (request) => {
      const { id } = params("id").parse(request.params);
      return toggleRunbookStep(id, currentUserId(request));
    });

    authed.post("/api/workspaces/:id/labels", async (request) => {
      const { id } = params("id").parse(request.params);
      const { name, color } = labelInput.parse(request.body);
      return repository.createLabel(id, name, color, currentUserId(request));
    });

    authed.patch("/api/labels/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      const patch = labelPatch.parse(request.body);
      const label = await prisma.label.findUnique({ where: { id }, select: { workspaceId: true } });
      const result = await repository.updateLabel(id, patch, currentUserId(request));
      if (label) publishWorkspaceChange(label.workspaceId);
      return result;
    });

    authed.delete("/api/labels/:id", async (request, reply) => {
      const { id } = params("id").parse(request.params);
      const label = await prisma.label.findUnique({ where: { id }, select: { workspaceId: true } });
      await repository.deleteLabel(id, currentUserId(request));
      if (label) publishWorkspaceChange(label.workspaceId);
      reply.code(204).send();
    });

    authed.post("/api/workspaces/:id/sprints", async (request) => {
      const { id: workspaceId } = params("id").parse(request.params);
      const data = sprintInput.parse(request.body);
      return repository.createSprint({ workspaceId, ...data, userId: currentUserId(request) });
    });

    authed.patch("/api/sprints/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      const patch = sprintPatch.parse(request.body);
      return repository.updateSprint(id, patch, currentUserId(request));
    });

    authed.delete("/api/sprints/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      return repository.deleteSprint(id, currentUserId(request));
    });

    authed.post("/api/workspaces/:id/fields", async (request) => {
      const { id: workspaceId } = params("id").parse(request.params);
      const data = customFieldInput.parse(request.body);
      return repository.createCustomField({ workspaceId, ...data, userId: currentUserId(request) });
    });

    authed.patch("/api/fields/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      const patch = customFieldPatch.parse(request.body);
      return repository.updateCustomField(id, patch, currentUserId(request));
    });

    authed.delete("/api/fields/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      return repository.deleteCustomField(id, currentUserId(request));
    });

    authed.post("/api/workspaces/:id/docs", async (request) => {
      const { id: workspaceId } = params("id").parse(request.params);
      const { title, projectId } = docCreateInput.parse(request.body);
      return repository.createDoc(workspaceId, title, currentUserId(request), projectId);
    });

    authed.patch("/api/docs/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      const patch = docPatch.parse(request.body);
      return repository.updateDoc(id, patch, currentUserId(request));
    });

    authed.delete("/api/docs/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      return repository.deleteDoc(id, currentUserId(request));
    });

    authed.post("/api/workspaces/:id/whiteboards", async (request) => {
      const { id: workspaceId } = params("id").parse(request.params);
      const { title, projectId } = whiteboardCreateInput.parse(request.body);
      return whiteboards.createWhiteboard(
        workspaceId,
        { title, projectId },
        currentUserId(request),
      );
    });

    authed.get("/api/whiteboards/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      return whiteboards.readWhiteboard(id, currentUserId(request));
    });

    // A cena inteira viaja a cada salvamento automático; o limite global de 1 MB
    // derrubaria qualquer quadro com imagens coladas. Mesmo idioma dos anexos.
    authed.patch("/api/whiteboards/:id", { bodyLimit: 8 * 1024 * 1024 }, async (request) => {
      const { id } = params("id").parse(request.params);
      const patch = whiteboardPatch.parse(request.body);
      return whiteboards.updateWhiteboard(id, patch, currentUserId(request));
    });

    authed.delete("/api/whiteboards/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      return whiteboards.deleteWhiteboard(id, currentUserId(request));
    });

    authed.post("/api/workspaces/:id/goals", async (request) => {
      const { id: workspaceId } = params("id").parse(request.params);
      const data = goalInput.parse(request.body);
      return repository.createGoal({ workspaceId, ...data, userId: currentUserId(request) });
    });

    authed.patch("/api/goals/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      const patch = goalPatch.parse(request.body);
      return repository.updateGoal(id, patch, currentUserId(request));
    });

    authed.delete("/api/goals/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      return repository.deleteGoal(id, currentUserId(request));
    });

    authed.patch("/api/goals/:goalId/tasks/:taskId/toggle", async (request) => {
      const { goalId, taskId } = params("goalId", "taskId").parse(request.params);
      return repository.toggleGoalTask(goalId, taskId, currentUserId(request));
    });

    authed.patch("/api/goals/:goalId/sprints/:sprintId/toggle", async (request) => {
      const { goalId, sprintId } = params("goalId", "sprintId").parse(request.params);
      return repository.toggleGoalSprint(goalId, sprintId, currentUserId(request));
    });

    authed.post("/api/workspaces/:id/automations", async (request) => {
      const { id: workspaceId } = params("id").parse(request.params);
      const data = automationInput.parse(request.body);
      return repository.createAutomation({ workspaceId, ...data, userId: currentUserId(request) });
    });

    authed.patch("/api/automations/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      const patch = automationPatch.parse(request.body);
      return repository.updateAutomation(id, patch, currentUserId(request));
    });

    authed.delete("/api/automations/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      return repository.deleteAutomation(id, currentUserId(request));
    });

    authed.patch("/api/workspaces/:id/members/:userId", async (request) => {
      const { id: workspaceId, userId } = params("id", "userId").parse(request.params);
      const patch = memberPatch.parse(request.body);
      return repository.updateMember(workspaceId, userId, patch, currentUserId(request));
    });

    authed.delete("/api/workspaces/:id/members/:userId", async (request) => {
      const { id: workspaceId, userId } = params("id", "userId").parse(request.params);
      return repository.removeMember(workspaceId, userId, currentUserId(request));
    });

    authed.get("/api/workspaces/:id/audit", async (request) => {
      const { id } = params("id").parse(request.params);
      const query = z
        .object({
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(30),
        })
        .parse(request.query);
      return listAuditEvents(id, currentUserId(request), query.cursor, query.limit);
    });

    authed.get("/api/workspaces/:id/events", async (request, reply) => {
      const { id } = params("id").parse(request.params);
      await prisma.$transaction((tx) => assertWorkspaceMember(tx, currentUserId(request), id));
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      reply.raw.write("event: ready\ndata: {}\n\n");
      const unsubscribe = subscribeWorkspace(id, (event) => {
        reply.raw.write(`event: ${event}\ndata: {}\n\n`);
      });
      const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 20_000);
      request.raw.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    });

    authed.post("/api/audit/:id/undo", async (request) => {
      const { id } = params("id").parse(request.params);
      const task = await undoAuditEvent(id, currentUserId(request));
      publishWorkspaceChange(task.workspaceId);
      return { ok: true };
    });
  });
}
