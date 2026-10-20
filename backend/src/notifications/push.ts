import webpush from "web-push";

import { getEnv } from "@/config/env";
import { prisma } from "@/db/client";

export type PushCategory =
  | "taskAssigned"
  | "taskUpdates"
  | "taskComments"
  | "taskDueSoon"
  | "meetings"
  | "githubPullRequests"
  | "githubActions";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  icon?: string;
  badge?: string;
};

export const defaultPushPreferences = {
  enabled: true,
  taskAssigned: true,
  taskUpdates: true,
  taskComments: true,
  taskDueSoon: true,
  meetings: true,
  githubPullRequests: true,
  githubActions: true,
};

export function webPushConfigured() {
  const env = getEnv();
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

function configureWebPush() {
  const env = getEnv();
  if (!webPushConfigured()) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  return true;
}

async function reserveEvent(userId: string, eventKey: string) {
  const result = await prisma.pushNotificationEvent.createMany({
    data: [{ userId, eventKey }],
    skipDuplicates: true,
  });
  return result.count === 1;
}

export async function sendPushToUsers(
  userIds: string[],
  category: PushCategory,
  payload: PushPayload,
  eventKey: string,
  options: { ignorePreferences?: boolean } = {},
) {
  if (!configureWebPush()) return;
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      pushPreference: true,
      webPushSubscriptions: true,
    },
  });
  await Promise.allSettled(
    users.map(async (user) => {
      const preference = user.pushPreference ?? defaultPushPreferences;
      if (
        (!options.ignorePreferences && (!preference.enabled || !preference[category])) ||
        user.webPushSubscriptions.length === 0
      )
        return;
      if (!(await reserveEvent(user.id, eventKey))) return;
      await Promise.allSettled(
        user.webPushSubscriptions.map(async (subscription) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              JSON.stringify({
                ...payload,
                icon: payload.icon ?? "/brand/app-icon-192.png",
                badge: payload.badge ?? "/brand/favicon-white-32.png",
              }),
              { TTL: 24 * 60 * 60, urgency: "high" },
            );
            await prisma.webPushSubscription.update({
              where: { id: subscription.id },
              data: { failureCount: 0, lastSuccessAt: new Date() },
            });
          } catch (error) {
            const statusCode = (error as { statusCode?: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) {
              await prisma.webPushSubscription.deleteMany({ where: { id: subscription.id } });
            } else {
              await prisma.webPushSubscription.update({
                where: { id: subscription.id },
                data: { failureCount: { increment: 1 } },
              });
            }
          }
        }),
      );
    }),
  );
}

export async function taskNotificationRecipients(taskId: string, excludeUserId?: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      assignees: { select: { userId: true } },
      activities: {
        where: { kind: "created" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { authorId: true },
      },
    },
  });
  if (!task) return [];
  return [
    ...new Set([
      ...task.assignees.map((assignment) => assignment.userId),
      ...task.activities.map((activity) => activity.authorId),
    ]),
  ].filter((userId) => userId !== excludeUserId);
}

export async function notifyTask(
  task: { id: string; workspaceId: string; title: string },
  actorId: string | undefined,
  category: PushCategory,
  body: string,
  eventKey: string,
) {
  const recipients = await taskNotificationRecipients(task.id, actorId);
  await sendPushToUsers(
    recipients,
    category,
    {
      title: task.title,
      body,
      url: `/workspace/${task.workspaceId}/board`,
      tag: `task-${task.id}`,
    },
    eventKey,
  );
}

export async function notifyMeeting(
  meeting: {
    id: string;
    workspaceId: string;
    organizerId: string;
    title: string;
    attendeeEmails: string[];
  },
  actorId: string | undefined,
  body: string,
  eventKey: string,
) {
  const users = await prisma.user.findMany({
    where: {
      memberships: { some: { workspaceId: meeting.workspaceId } },
      OR: [
        { id: meeting.organizerId },
        { email: { in: meeting.attendeeEmails.map((email) => email.toLowerCase()) } },
      ],
    },
    select: { id: true },
  });
  await sendPushToUsers(
    users.map((user) => user.id).filter((userId) => userId !== actorId),
    "meetings",
    { title: meeting.title, body, url: "/calendar", tag: `meeting-${meeting.id}` },
    eventKey,
  );
}

export async function notifyGitHubEvent(input: {
  installationId: string;
  repositoryFullName: string;
  category: "githubPullRequests" | "githubActions";
  title: string;
  body: string;
  deliveryId: string;
  pullRequestNumbers?: number[];
  headSha?: string;
}) {
  const connections = await prisma.gitHubConnection.findMany({
    where: { installationId: input.installationId },
    select: {
      workspaceId: true,
      workspace: {
        select: {
          members: {
            where: { permission: { in: ["OWNER", "ADMIN"] } },
            select: { userId: true },
          },
        },
      },
    },
  });
  const links = await prisma.gitHubPullRequestLink.findMany({
    where: {
      repositoryFullName: input.repositoryFullName,
      ...(input.pullRequestNumbers?.length
        ? { pullRequestNumber: { in: input.pullRequestNumbers } }
        : input.headSha
          ? { headSha: input.headSha }
          : {}),
      task: {
        workspace: { githubConnections: { some: { installationId: input.installationId } } },
      },
    },
    select: {
      task: {
        select: {
          workspaceId: true,
          assignees: { select: { userId: true } },
          activities: {
            where: { kind: "created" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { authorId: true },
          },
        },
      },
    },
  });
  await Promise.allSettled(
    connections.map(async (connection) => {
      const taskUsers = links
        .filter((link) => link.task.workspaceId === connection.workspaceId)
        .flatMap((link) => [
          ...link.task.assignees.map((assignment) => assignment.userId),
          ...link.task.activities.map((activity) => activity.authorId),
        ]);
      const recipients = [
        ...connection.workspace.members.map((member) => member.userId),
        ...taskUsers,
      ];
      await sendPushToUsers(
        recipients,
        input.category,
        {
          title: input.title,
          body: input.body,
          url: `/workspace/${connection.workspaceId}/github`,
          tag: `${input.category}-${input.repositoryFullName}`,
        },
        `${input.deliveryId}:${connection.workspaceId}`,
      );
    }),
  );
}
