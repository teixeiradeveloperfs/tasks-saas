import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireSession } from "@/auth/require-session";
import { assertWorkspaceAdmin, assertWorkspaceMember, NotFoundError } from "@/auth/authorization";
import { getEnv } from "@/config/env";
import { prisma } from "@/db/client";
import { notifyGitHubEvent } from "@/notifications/push";
import {
  exchangeGitHubUserCode,
  githubConfigured,
  githubInstallationUrl,
  githubRepositoryActivity,
  githubUserAuthorizationUrl,
  listGitHubRepositories,
  verifyUserInstallation,
} from "@/integrations/github";
import { currentUserId } from "@/workspace/current-user";
import { refreshLinksFromWebhook } from "@/workspace/github-task-repository";
import { publishWorkspaceChange } from "@/workspace/realtime";

const COOKIE_PATH = "/api/integrations/github";
const INSTALL_STATE = "automa_github_install_state";
const OAUTH_STATE = "automa_github_oauth_state";
const WORKSPACE = "automa_github_workspace";
const INSTALLATION = "automa_github_installation";
const RETURN_TO = "automa_github_return";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getEnv().NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: 15 * 60,
  };
}

function sameOpaqueValue(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function safeReturnTo(value: string | undefined, workspaceId: string) {
  const fallback = `/workspace/${workspaceId}/github`;
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function destination(path: string, result: "connected" | "error") {
  const url = new URL(path, getEnv().APP_ORIGIN);
  url.searchParams.set("github", result);
  return url.toString();
}

export function registerGitHubRoutes(app: FastifyInstance): void {
  app.post("/api/integrations/github/webhook", async (request, reply) => {
    const secret = getEnv().GITHUB_WEBHOOK_SECRET;
    const signature = request.headers["x-hub-signature-256"];
    if (!secret || typeof signature !== "string" || !request.rawBody) {
      return reply.code(401).send({ error: "Assinatura do webhook ausente." });
    }
    const expected = `sha256=${createHmac("sha256", secret).update(request.rawBody).digest("hex")}`;
    if (!sameOpaqueValue(signature, expected)) {
      return reply.code(401).send({ error: "Assinatura do webhook inválida." });
    }
    const event = request.headers["x-github-event"];
    const body = request.body as {
      action?: string;
      installation?: { id?: number };
      repository?: { full_name?: string };
      pull_request?: {
        number?: number;
        title?: string;
        html_url?: string;
        merged?: boolean;
      };
      workflow_run?: {
        id?: number;
        name?: string;
        display_title?: string;
        status?: string;
        conclusion?: string | null;
        head_sha?: string;
        pull_requests?: Array<{ number?: number }>;
      };
    };
    if (event === "ping") return reply.code(204).send();
    const installationId = body.installation?.id;
    const repositoryFullName = body.repository?.full_name;
    if (!installationId || !repositoryFullName) return reply.code(202).send();
    const queueRefresh = (input: Parameters<typeof refreshLinksFromWebhook>[0]) => {
      void refreshLinksFromWebhook(input)
        .then((workspaces) => workspaces.forEach(publishWorkspaceChange))
        .catch((error) => request.log.error(error));
    };
    const deliveryId =
      typeof request.headers["x-github-delivery"] === "string"
        ? request.headers["x-github-delivery"]
        : `github:${installationId}:${Date.now()}`;
    if (event === "pull_request" && body.pull_request?.number) {
      queueRefresh({
        installationId: String(installationId),
        repositoryFullName,
        pullRequestNumbers: [body.pull_request.number],
      });
      if (["opened", "reopened", "closed"].includes(body.action ?? "")) {
        const state =
          body.action === "closed"
            ? body.pull_request.merged
              ? "mergeada"
              : "fechada"
            : body.action === "reopened"
              ? "reaberta"
              : "aberta";
        void notifyGitHubEvent({
          installationId: String(installationId),
          repositoryFullName,
          category: "githubPullRequests",
          title: `PR #${body.pull_request.number} ${state}`,
          body: `${repositoryFullName}: ${body.pull_request.title ?? "Pull request"}`,
          deliveryId,
          pullRequestNumbers: [body.pull_request.number],
        }).catch((error) => request.log.error(error));
      }
    }
    if (event === "workflow_run" && body.workflow_run) {
      const numbers = (body.workflow_run.pull_requests ?? [])
        .map((pull) => pull.number)
        .filter((number): number is number => Boolean(number));
      queueRefresh({
        installationId: String(installationId),
        repositoryFullName,
        pullRequestNumbers: numbers.length ? numbers : undefined,
        headSha: body.workflow_run.head_sha,
      });
      if (body.workflow_run.status === "completed") {
        const result =
          body.workflow_run.conclusion === "success"
            ? "concluiu com sucesso"
            : body.workflow_run.conclusion === "cancelled"
              ? "foi cancelado"
              : `falhou (${body.workflow_run.conclusion ?? "sem resultado"})`;
        void notifyGitHubEvent({
          installationId: String(installationId),
          repositoryFullName,
          category: "githubActions",
          title: `${body.workflow_run.name ?? "GitHub Actions"} ${result}`,
          body: `${repositoryFullName}: ${body.workflow_run.display_title ?? "Execução finalizada"}`,
          deliveryId,
          pullRequestNumbers: numbers.length ? numbers : undefined,
          headSha: body.workflow_run.head_sha,
        }).catch((error) => request.log.error(error));
      }
    }
    return reply.code(202).send();
  });

  app.register(async (authed) => {
    authed.addHook("preHandler", requireSession);

    authed.get("/api/integrations/github/start", async (request, reply) => {
      const query = z
        .object({ workspaceId: z.string().uuid(), returnTo: z.string().optional() })
        .parse(request.query);
      await prisma.$transaction((tx) =>
        assertWorkspaceAdmin(tx, currentUserId(request), query.workspaceId),
      );
      const state = randomBytes(32).toString("base64url");
      const options = cookieOptions();
      reply.setCookie(INSTALL_STATE, state, options);
      reply.setCookie(WORKSPACE, query.workspaceId, options);
      reply.setCookie(RETURN_TO, safeReturnTo(query.returnTo, query.workspaceId), options);
      return reply.redirect(githubInstallationUrl(state));
    });

    authed.get("/api/integrations/github/setup", async (request, reply) => {
      const query = z
        .object({ installation_id: z.coerce.string().min(1), state: z.string().optional() })
        .parse(request.query);
      const workspaceId = request.cookies[WORKSPACE];
      const returnTo = safeReturnTo(request.cookies[RETURN_TO], workspaceId ?? "");
      if (!workspaceId || !sameOpaqueValue(query.state, request.cookies[INSTALL_STATE])) {
        return reply.redirect(destination(returnTo, "error"));
      }
      await prisma.$transaction((tx) =>
        assertWorkspaceAdmin(tx, currentUserId(request), workspaceId),
      );
      const oauthState = randomBytes(32).toString("base64url");
      const options = cookieOptions();
      reply.clearCookie(INSTALL_STATE, options);
      reply.setCookie(OAUTH_STATE, oauthState, options);
      reply.setCookie(INSTALLATION, query.installation_id, options);
      return reply.redirect(githubUserAuthorizationUrl(oauthState));
    });

    authed.get("/api/integrations/github/oauth-callback", async (request, reply) => {
      const query = z
        .object({
          code: z.string().optional(),
          state: z.string().optional(),
          error: z.string().optional(),
        })
        .parse(request.query);
      const workspaceId = request.cookies[WORKSPACE];
      const installationId = request.cookies[INSTALLATION];
      const returnTo = safeReturnTo(request.cookies[RETURN_TO], workspaceId ?? "");
      const options = cookieOptions();
      for (const name of [OAUTH_STATE, WORKSPACE, INSTALLATION, RETURN_TO]) {
        reply.clearCookie(name, options);
      }
      if (
        query.error ||
        !query.code ||
        !workspaceId ||
        !installationId ||
        !sameOpaqueValue(query.state, request.cookies[OAUTH_STATE])
      ) {
        return reply.redirect(destination(returnTo, "error"));
      }
      try {
        await prisma.$transaction((tx) =>
          assertWorkspaceAdmin(tx, currentUserId(request), workspaceId),
        );
        const userToken = await exchangeGitHubUserCode(query.code);
        const installation = await verifyUserInstallation(userToken, installationId);
        if (!installation.account) throw new Error("Instalação sem conta.");
        await prisma.gitHubConnection.upsert({
          where: {
            workspaceId_installationId: { workspaceId, installationId },
          },
          create: {
            workspaceId,
            installationId,
            accountLogin: installation.account.login,
            accountType: installation.account.type,
            accountAvatar: installation.account.avatar_url,
            connectedById: currentUserId(request),
          },
          update: {
            installationId,
            accountLogin: installation.account.login,
            accountType: installation.account.type,
            accountAvatar: installation.account.avatar_url,
            connectedById: currentUserId(request),
            connectedAt: new Date(),
          },
        });
        return reply.redirect(destination(returnTo, "connected"));
      } catch (error) {
        request.log.error(error);
        return reply.redirect(destination(returnTo, "error"));
      }
    });

    authed.get("/api/workspaces/:workspaceId/github/status", async (request) => {
      const { workspaceId } = z.object({ workspaceId: z.string().uuid() }).parse(request.params);
      const member = await prisma.$transaction((tx) =>
        assertWorkspaceMember(tx, currentUserId(request), workspaceId),
      );
      const connections = await prisma.gitHubConnection.findMany({
        where: { workspaceId },
        orderBy: { connectedAt: "asc" },
      });
      return {
        configured: githubConfigured(),
        connected: connections.length > 0,
        canManage: member?.permission === "OWNER" || member?.permission === "ADMIN",
        connections: connections.map((connection) => ({
          id: connection.id,
          accountLogin: connection.accountLogin,
          accountType: connection.accountType,
          accountAvatar: connection.accountAvatar ?? undefined,
          connectedAt: connection.connectedAt.toISOString(),
        })),
      };
    });

    authed.get("/api/workspaces/:workspaceId/github/repositories", async (request) => {
      const { workspaceId } = z.object({ workspaceId: z.string().uuid() }).parse(request.params);
      await prisma.$transaction((tx) =>
        assertWorkspaceMember(tx, currentUserId(request), workspaceId),
      );
      const connections = await prisma.gitHubConnection.findMany({ where: { workspaceId } });
      if (connections.length === 0) throw new NotFoundError();
      const results = await Promise.allSettled(
        connections.map(async (connection) => {
          const repositories = await listGitHubRepositories(connection.installationId);
          return repositories.map((repository) => ({
            ...repository,
            connectionId: connection.id,
            accountLogin: connection.accountLogin,
            accountType: connection.accountType,
          }));
        }),
      );
      const available = results.flatMap((result) => {
        if (result.status === "fulfilled") return result.value;
        request.log.warn(result.reason, "Falha ao consultar uma instalação GitHub do workspace");
        return [];
      });
      if (available.length === 0 && results.every((result) => result.status === "rejected")) {
        throw results[0].reason;
      }
      return available
        .filter(
          (repository, index, all) =>
            all.findIndex((candidate) => candidate.id === repository.id) === index,
        )
        .sort((left, right) => left.fullName.localeCompare(right.fullName));
    });

    authed.get("/api/workspaces/:workspaceId/github/activity", async (request) => {
      const { workspaceId } = z.object({ workspaceId: z.string().uuid() }).parse(request.params);
      const { repository, connectionId } = z
        .object({ repository: z.string().min(3).max(300), connectionId: z.string().uuid() })
        .parse(request.query);
      await prisma.$transaction((tx) =>
        assertWorkspaceMember(tx, currentUserId(request), workspaceId),
      );
      const connection = await prisma.gitHubConnection.findFirst({
        where: { id: connectionId, workspaceId },
      });
      if (!connection) throw new NotFoundError();
      return githubRepositoryActivity(connection.installationId, repository);
    });

    authed.delete(
      "/api/workspaces/:workspaceId/github/connections/:connectionId",
      async (request, reply) => {
        const { workspaceId, connectionId } = z
          .object({ workspaceId: z.string().uuid(), connectionId: z.string().uuid() })
          .parse(request.params);
        await prisma.$transaction(async (tx) => {
          await assertWorkspaceAdmin(tx, currentUserId(request), workspaceId);
          await tx.gitHubConnection.deleteMany({ where: { id: connectionId, workspaceId } });
        });
        reply.code(204).send();
      },
    );

    authed.delete("/api/workspaces/:workspaceId/github", async (request, reply) => {
      const { workspaceId } = z.object({ workspaceId: z.string().uuid() }).parse(request.params);
      await prisma.$transaction(async (tx) => {
        await assertWorkspaceAdmin(tx, currentUserId(request), workspaceId);
        await tx.gitHubConnection.deleteMany({ where: { workspaceId } });
      });
      reply.code(204).send();
    });
  });
}
