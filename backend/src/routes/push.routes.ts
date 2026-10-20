import type { FastifyInstance } from "fastify";
import {
  pushPreferenceInput,
  pushSubscriptionInput,
} from "@task-flow/shared/domain/push-contracts";

import { requireSession } from "@/auth/require-session";
import { getEnv } from "@/config/env";
import { prisma } from "@/db/client";
import { defaultPushPreferences, sendPushToUsers, webPushConfigured } from "@/notifications/push";
import { currentUserId } from "@/workspace/current-user";

export function registerPushRoutes(app: FastifyInstance) {
  app.register(async (authed) => {
    authed.addHook("preHandler", requireSession);

    authed.get("/api/push/status", async (request) => {
      const userId = currentUserId(request);
      const [preference, subscriptionCount] = await Promise.all([
        prisma.pushPreference.findUnique({ where: { userId } }),
        prisma.webPushSubscription.count({ where: { userId } }),
      ]);
      return {
        configured: webPushConfigured(),
        publicKey: webPushConfigured() ? getEnv().VAPID_PUBLIC_KEY : undefined,
        subscriptionCount,
        preferences: preference ?? defaultPushPreferences,
      };
    });

    authed.post("/api/push/subscriptions", async (request, reply) => {
      const userId = currentUserId(request);
      const input = pushSubscriptionInput.parse(request.body);
      await prisma.webPushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: {
          userId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: request.headers["user-agent"],
        },
        update: {
          userId,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: request.headers["user-agent"],
          failureCount: 0,
        },
      });
      reply.code(204).send();
    });

    authed.post("/api/push/unsubscribe", async (request, reply) => {
      const userId = currentUserId(request);
      const { endpoint } = pushSubscriptionInput.pick({ endpoint: true }).parse(request.body);
      await prisma.webPushSubscription.deleteMany({ where: { userId, endpoint } });
      reply.code(204).send();
    });

    authed.patch("/api/push/preferences", async (request) => {
      const userId = currentUserId(request);
      const patch = pushPreferenceInput.parse(request.body);
      return prisma.pushPreference.upsert({
        where: { userId },
        create: { userId, ...defaultPushPreferences, ...patch },
        update: patch,
      });
    });

    authed.post("/api/push/test", async (request, reply) => {
      const userId = currentUserId(request);
      await sendPushToUsers(
        [userId],
        "taskUpdates",
        { title: "Taskora", body: "As notificações push estão funcionando.", url: "/" },
        `push-test:${userId}:${Date.now()}`,
        { ignorePreferences: true },
      );
      reply.code(204).send();
    });
  });
}
