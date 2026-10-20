import type { Task } from "@task-flow/shared/domain/models";

import { assertTaskEditor } from "@/auth/authorization";
import { prisma } from "@/db/client";
import { readGitHubPullRequest } from "@/integrations/github";
import { mapTask, taskInclude } from "@/workspace/task-mapping";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

class GitHubTaskError extends Error {
  statusCode = 400;
  constructor(readonly statusMessage: string) {
    super(statusMessage);
  }
}

function parsePullRequestUrl(value: string) {
  const url = new URL(value);
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    url.hostname.toLowerCase() !== "github.com" ||
    parts.length !== 4 ||
    parts[2] !== "pull" ||
    !/^\d+$/.test(parts[3])
  ) {
    throw new GitHubTaskError("Use o link completo de uma pull request do GitHub.");
  }
  return { repositoryFullName: `${parts[0]}/${parts[1]}`, number: Number(parts[3]) };
}

type Connection = { installationId: string; accountLogin: string };

async function readPullRequestFromConnections(
  connections: Connection[],
  repositoryFullName: string,
  number: number,
) {
  if (connections.length === 0) {
    throw new GitHubTaskError("Conecte o GitHub ao workspace primeiro.");
  }
  const owner = repositoryFullName.split("/")[0]?.toLowerCase();
  const ordered = [...connections].sort((left, right) => {
    const leftMatches = left.accountLogin.toLowerCase() === owner;
    const rightMatches = right.accountLogin.toLowerCase() === owner;
    return Number(rightMatches) - Number(leftMatches);
  });
  for (const connection of ordered) {
    try {
      return await readGitHubPullRequest(connection.installationId, repositoryFullName, number);
    } catch {
      // A PR pode pertencer a qualquer uma das instalações ligadas ao workspace.
    }
  }
  throw new GitHubTaskError(
    "A pull request não pertence a nenhum repositório autorizado neste workspace.",
  );
}

async function readTask(tx: Tx, taskId: string): Promise<Task> {
  return mapTask(await tx.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude }));
}

export async function linkPullRequest(taskId: string, url: string, userId: string): Promise<Task> {
  const task = await prisma.$transaction(async (tx) => {
    await assertTaskEditor(tx, userId, taskId);
    return tx.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { workspaceId: true, workspace: { select: { githubConnections: true } } },
    });
  });
  const parsed = parsePullRequestUrl(url);
  const pull = await readPullRequestFromConnections(
    task.workspace.githubConnections,
    parsed.repositoryFullName,
    parsed.number,
  );
  return prisma.$transaction(async (tx) => {
    await assertTaskEditor(tx, userId, taskId);
    await tx.gitHubPullRequestLink.upsert({
      where: {
        taskId_repositoryFullName_pullRequestNumber: {
          taskId,
          repositoryFullName: pull.repositoryFullName,
          pullRequestNumber: pull.number,
        },
      },
      create: {
        taskId,
        repositoryFullName: pull.repositoryFullName,
        pullRequestNumber: pull.number,
        title: pull.title,
        url: pull.url,
        state: pull.state,
        draft: pull.draft,
        merged: pull.merged,
        headSha: pull.headSha,
        ciStatus: pull.ciStatus,
        ciConclusion: pull.ciConclusion,
      },
      update: {
        title: pull.title,
        url: pull.url,
        state: pull.state,
        draft: pull.draft,
        merged: pull.merged,
        headSha: pull.headSha,
        ciStatus: pull.ciStatus,
        ciConclusion: pull.ciConclusion,
        checkedAt: new Date(),
      },
    });
    return readTask(tx, taskId);
  });
}

export async function refreshPullRequest(
  taskId: string,
  linkId: string,
  userId: string,
): Promise<Task> {
  await prisma.$transaction((tx) => assertTaskEditor(tx, userId, taskId));
  await refreshPullRequestLink(linkId, taskId);
  return prisma.$transaction((tx) => readTask(tx, taskId));
}

async function refreshPullRequestLink(linkId: string, expectedTaskId?: string): Promise<void> {
  const link = await prisma.gitHubPullRequestLink.findFirstOrThrow({
    where: { id: linkId, ...(expectedTaskId && { taskId: expectedTaskId }) },
    include: { task: { include: { workspace: { include: { githubConnections: true } } } } },
  });
  if (link.task.workspace.githubConnections.length === 0) return;
  const pull = await readPullRequestFromConnections(
    link.task.workspace.githubConnections,
    link.repositoryFullName,
    link.pullRequestNumber,
  );
  await prisma.gitHubPullRequestLink.update({
    where: { id: link.id },
    data: {
      title: pull.title,
      url: pull.url,
      state: pull.state,
      draft: pull.draft,
      merged: pull.merged,
      headSha: pull.headSha,
      ciStatus: pull.ciStatus,
      ciConclusion: pull.ciConclusion,
      checkedAt: new Date(),
    },
  });
}

export async function removePullRequest(
  taskId: string,
  linkId: string,
  userId: string,
): Promise<Task> {
  return prisma.$transaction(async (tx) => {
    await assertTaskEditor(tx, userId, taskId);
    await tx.gitHubPullRequestLink.deleteMany({ where: { id: linkId, taskId } });
    return readTask(tx, taskId);
  });
}

export async function refreshLinksFromWebhook(input: {
  installationId: string;
  repositoryFullName: string;
  pullRequestNumbers?: number[];
  headSha?: string;
}): Promise<string[]> {
  const links = await prisma.gitHubPullRequestLink.findMany({
    where: {
      repositoryFullName: input.repositoryFullName,
      task: {
        workspace: {
          githubConnections: { some: { installationId: input.installationId } },
        },
      },
      ...(input.pullRequestNumbers?.length
        ? { pullRequestNumber: { in: input.pullRequestNumbers } }
        : input.headSha
          ? { headSha: input.headSha }
          : {}),
    },
    select: { id: true, task: { select: { workspaceId: true } } },
  });
  await Promise.allSettled(links.map((link) => refreshPullRequestLink(link.id)));
  return [...new Set(links.map((link) => link.task.workspaceId))];
}
