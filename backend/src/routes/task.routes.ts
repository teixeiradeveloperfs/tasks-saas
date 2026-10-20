import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  addBlockerInput,
  addCommentInput,
  addTimeEntryInput,
  attachmentInput,
  createTaskInput,
  moveTaskInput,
  moveTaskToColumnInput,
  linkPullRequestInput,
  setEstimateInput,
  setFieldValueInput,
  subtaskTitleInput,
  updateTaskInput,
} from "@task-flow/shared/domain/task-contracts";

import { requireSession } from "@/auth/require-session";
import { prisma } from "@/db/client";
import { notifyTask, sendPushToUsers, taskNotificationRecipients } from "@/notifications/push";
import { currentUserId } from "@/workspace/current-user";
import * as repository from "@/workspace/task-repository";
import * as githubTaskRepository from "@/workspace/github-task-repository";
import { publishWorkspaceChange } from "@/workspace/realtime";

const params = (...keys: string[]) =>
  z.object(Object.fromEntries(keys.map((k) => [k, z.string()])));

export function registerTaskRoutes(app: FastifyInstance): void {
  app.register(async (authed) => {
    authed.addHook("preHandler", requireSession);
    authed.addHook("onSend", async (request, reply, payload) => {
      if (request.method !== "GET" && reply.statusCode < 400 && typeof payload === "string") {
        try {
          const body = JSON.parse(payload) as { workspaceId?: string };
          if (body.workspaceId) publishWorkspaceChange(body.workspaceId);
        } catch {
          // Responses without a task body (for example 204) have nothing to publish here.
        }
      }
      return payload;
    });

    const queueTaskNotification = (
      request: { log: { error: (error: unknown) => void } },
      operation: ReturnType<typeof notifyTask>,
    ) => void operation.catch((error) => request.log.error(error));

    authed.post("/api/tasks", async (request) => {
      const data = createTaskInput.parse(request.body);
      const userId = currentUserId(request);
      const task = await repository.createTask(data, userId);
      queueTaskNotification(
        request,
        notifyTask(
          task,
          userId,
          "taskAssigned",
          "Uma nova tarefa foi atribuída a você.",
          `task-created:${task.id}`,
        ),
      );
      return task;
    });

    authed.patch("/api/tasks/:id", async (request) => {
      const { id } = params("id").parse(request.params);
      const patch = updateTaskInput.parse(request.body);
      const userId = currentUserId(request);
      const task = await repository.updateTask(id, patch, userId);
      const assignmentChanged = patch.assigneeIds !== undefined || patch.assigneeId !== undefined;
      queueTaskNotification(
        request,
        notifyTask(
          task,
          userId,
          assignmentChanged ? "taskAssigned" : "taskUpdates",
          assignmentChanged
            ? "Os responsáveis desta tarefa foram atualizados."
            : "A tarefa recebeu uma atualização importante.",
          `task-updated:${task.id}:${Date.now()}`,
        ),
      );
      return task;
    });

    authed.patch("/api/tasks/:id/move", async (request) => {
      const { id } = params("id").parse(request.params);
      const { status, position } = moveTaskInput.parse(request.body);
      const userId = currentUserId(request);
      const task = await repository.moveTask(id, status, userId, position);
      queueTaskNotification(
        request,
        notifyTask(
          task,
          userId,
          "taskUpdates",
          `Status alterado para ${task.status}.`,
          `task-moved:${task.id}:${Date.now()}`,
        ),
      );
      return task;
    });

    authed.patch("/api/tasks/:id/move-column", async (request) => {
      const { id } = params("id").parse(request.params);
      const data = moveTaskToColumnInput.parse(request.body);
      const userId = currentUserId(request);
      const task = await repository.moveTaskToColumn(id, data.boardColumnId, userId, data.position);
      queueTaskNotification(
        request,
        notifyTask(
          task,
          userId,
          "taskUpdates",
          `A tarefa foi movida para outra coluna.`,
          `task-column:${task.id}:${Date.now()}`,
        ),
      );
      return task;
    });

    authed.delete("/api/tasks/:id", async (request, reply) => {
      const { id } = params("id").parse(request.params);
      const userId = currentUserId(request);
      const [task, recipients] = await Promise.all([
        prisma.task.findUnique({
          where: { id },
          select: { id: true, title: true, workspaceId: true },
        }),
        taskNotificationRecipients(id, userId),
      ]);
      const workspaceId = await repository.deleteTask(id, userId);
      if (task) {
        queueTaskNotification(
          request,
          sendPushToUsers(
            recipients,
            "taskUpdates",
            {
              title: task.title,
              body: "A tarefa foi excluída.",
              url: `/workspace/${task.workspaceId}/board`,
              tag: `task-${task.id}`,
            },
            `task-deleted:${task.id}`,
          ),
        );
      }
      publishWorkspaceChange(workspaceId);
      reply.code(204).send();
    });

    authed.post("/api/tasks/:id/comments", async (request) => {
      const { id } = params("id").parse(request.params);
      const { text } = addCommentInput.parse(request.body);
      const userId = currentUserId(request);
      const task = await repository.addComment(id, text, userId);
      queueTaskNotification(
        request,
        notifyTask(
          task,
          userId,
          "taskComments",
          text.length > 120 ? `${text.slice(0, 117)}…` : text,
          `task-comment:${task.id}:${task.comments.at(-1)?.id ?? Date.now()}`,
        ),
      );
      return task;
    });

    authed.delete("/api/tasks/:id/comments/:commentId", async (request) => {
      const { id, commentId } = params("id", "commentId").parse(request.params);
      return repository.deleteComment(id, commentId, currentUserId(request));
    });

    authed.post("/api/tasks/:id/subtasks", async (request) => {
      const { id } = params("id").parse(request.params);
      const { title } = subtaskTitleInput.parse(request.body);
      const userId = currentUserId(request);
      const task = await repository.addSubtask(id, title, userId);
      queueTaskNotification(
        request,
        notifyTask(
          task,
          userId,
          "taskUpdates",
          `Subtarefa adicionada: ${title}`,
          `subtask-added:${task.id}:${task.subtasks.at(-1)?.id ?? Date.now()}`,
        ),
      );
      return task;
    });

    authed.patch("/api/tasks/:id/subtasks/:subtaskId/toggle", async (request) => {
      const { id, subtaskId } = params("id", "subtaskId").parse(request.params);
      const userId = currentUserId(request);
      const task = await repository.toggleSubtask(id, subtaskId, userId);
      const subtask = task.subtasks.find((item) => item.id === subtaskId);
      queueTaskNotification(
        request,
        notifyTask(
          task,
          userId,
          "taskUpdates",
          `${subtask?.done ? "Subtarefa concluída" : "Subtarefa reaberta"}: ${subtask?.title ?? task.title}`,
          `subtask-toggle:${task.id}:${subtaskId}:${subtask?.done}:${Date.now()}`,
        ),
      );
      return task;
    });

    authed.patch("/api/tasks/:id/subtasks/:subtaskId", async (request) => {
      const { id, subtaskId } = params("id", "subtaskId").parse(request.params);
      const { title } = subtaskTitleInput.parse(request.body);
      return repository.renameSubtask(id, subtaskId, title, currentUserId(request));
    });

    authed.delete("/api/tasks/:id/subtasks/:subtaskId", async (request) => {
      const { id, subtaskId } = params("id", "subtaskId").parse(request.params);
      return repository.removeSubtask(id, subtaskId, currentUserId(request));
    });

    authed.post("/api/tasks/:id/time-entries", async (request) => {
      const { id } = params("id").parse(request.params);
      const { minutes, note } = addTimeEntryInput.parse(request.body);
      return repository.addTimeEntry(id, minutes, note, currentUserId(request));
    });

    authed.delete("/api/tasks/:id/time-entries/:entryId", async (request) => {
      const { id, entryId } = params("id", "entryId").parse(request.params);
      return repository.removeTimeEntry(id, entryId, currentUserId(request));
    });

    authed.patch("/api/tasks/:id/estimate", async (request) => {
      const { id } = params("id").parse(request.params);
      const { minutes } = setEstimateInput.parse(request.body);
      return repository.setEstimate(id, minutes ?? undefined, currentUserId(request));
    });

    authed.patch("/api/tasks/:id/fields/:fieldId", async (request) => {
      const { id, fieldId } = params("id", "fieldId").parse(request.params);
      const { value } = setFieldValueInput.parse(request.body);
      return repository.setFieldValue(id, fieldId, value, currentUserId(request));
    });

    authed.post("/api/tasks/:id/blockers", async (request) => {
      const { id } = params("id").parse(request.params);
      const { blockerId } = addBlockerInput.parse(request.body);
      return repository.addBlocker(id, blockerId, currentUserId(request));
    });

    authed.delete("/api/tasks/:id/blockers/:blockerId", async (request) => {
      const { id, blockerId } = params("id", "blockerId").parse(request.params);
      return repository.removeBlocker(id, blockerId, currentUserId(request));
    });

    authed.post(
      "/api/tasks/:id/attachments",
      // Base64 adiciona cerca de 33% ao limite binário de 10 MB. As demais rotas
      // continuam protegidas pelo limite global de 1 MB.
      { bodyLimit: 15 * 1024 * 1024 },
      async (request) => {
        const { id } = params("id").parse(request.params);
        const data = attachmentInput.parse(request.body);
        return repository.addAttachment(id, data, currentUserId(request));
      },
    );

    authed.get("/api/attachments/:id", async (request, reply) => {
      const { id } = params("id").parse(request.params);
      const attachment = await repository.readAttachment(id, currentUserId(request));
      reply.header("Content-Type", attachment.mimeType);
      reply.header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
      );
      return reply.send(attachment.data);
    });

    authed.delete("/api/tasks/:taskId/attachments/:attachmentId", async (request) => {
      const { taskId, attachmentId } = params("taskId", "attachmentId").parse(request.params);
      return repository.removeAttachment(taskId, attachmentId, currentUserId(request));
    });

    authed.post("/api/tasks/:id/github/pull-requests", async (request) => {
      const { id } = params("id").parse(request.params);
      const { url } = linkPullRequestInput.parse(request.body);
      return githubTaskRepository.linkPullRequest(id, url, currentUserId(request));
    });

    authed.post("/api/tasks/:taskId/github/pull-requests/:linkId/refresh", async (request) => {
      const { taskId, linkId } = params("taskId", "linkId").parse(request.params);
      return githubTaskRepository.refreshPullRequest(taskId, linkId, currentUserId(request));
    });

    authed.delete("/api/tasks/:taskId/github/pull-requests/:linkId", async (request) => {
      const { taskId, linkId } = params("taskId", "linkId").parse(request.params);
      return githubTaskRepository.removePullRequest(taskId, linkId, currentUserId(request));
    });
  });
}
