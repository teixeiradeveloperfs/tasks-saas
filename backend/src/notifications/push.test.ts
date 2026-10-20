import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import { defaultPushPreferences } from "@/notifications/push";
import { seed } from "../../prisma/seed";

beforeEach(async () => {
  await resetDatabase();
});

describe("Web Push", () => {
  it("mantém várias inscrições isoladas por usuário", async () => {
    const { users } = await seed();
    await prisma.webPushSubscription.createMany({
      data: [
        {
          userId: users.voce.id,
          endpoint: "https://push.example/device-one",
          p256dh: "public-key-device-one-123456789",
          auth: "auth-device-one",
        },
        {
          userId: users.voce.id,
          endpoint: "https://push.example/device-two",
          p256dh: "public-key-device-two-123456789",
          auth: "auth-device-two",
        },
        {
          userId: users.ana.id,
          endpoint: "https://push.example/ana-device",
          p256dh: "public-key-ana-device-123456789",
          auth: "auth-ana-device",
        },
      ],
    });

    expect(await prisma.webPushSubscription.count({ where: { userId: users.voce.id } })).toBe(2);
    expect(await prisma.webPushSubscription.count({ where: { userId: users.ana.id } })).toBe(1);
  });

  it("persiste preferências e deduplica o mesmo evento por usuário", async () => {
    const { users } = await seed();
    await prisma.pushPreference.create({
      data: { userId: users.voce.id, ...defaultPushPreferences, githubActions: false },
    });
    const first = await prisma.pushNotificationEvent.createMany({
      data: [{ userId: users.voce.id, eventKey: "github-delivery-1" }],
      skipDuplicates: true,
    });
    const repeated = await prisma.pushNotificationEvent.createMany({
      data: [{ userId: users.voce.id, eventKey: "github-delivery-1" }],
      skipDuplicates: true,
    });

    expect(first.count).toBe(1);
    expect(repeated.count).toBe(0);
    expect(
      await prisma.pushPreference.findUnique({ where: { userId: users.voce.id } }),
    ).toMatchObject({ githubActions: false, taskUpdates: true });
  });
});
