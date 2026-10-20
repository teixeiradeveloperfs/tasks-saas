import { beforeEach, describe, expect, it } from "vitest";

import { NotFoundError } from "@/auth/authorization";
import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import {
  cancelMeeting,
  createMeeting,
  listMeetings,
  updateMeeting,
} from "@/workspace/meeting-repository";
import { seed } from "../../prisma/seed";

let workspaceId: string;
let ownerId: string;
let memberId: string;
let viewerId: string;

beforeEach(async () => {
  await resetDatabase();
  const seeded = await seed();
  workspaceId = seeded.workspaces.acme.id;
  ownerId = seeded.users.voce.id;
  memberId = seeded.users.ana.id;
  const viewer = await prisma.user.create({
    data: { name: "Viewer", email: "viewer@flow.app", avatarColor: "#333333" },
  });
  viewerId = viewer.id;
  await prisma.workspaceMember.create({
    data: { workspaceId, userId: viewerId, permission: "VIEWER" },
  });
});

const input = () => ({
  workspaceId,
  title: "Alinhamento semanal",
  startAt: "2026-08-10T14:00:00.000Z",
  endAt: "2026-08-10T15:00:00.000Z",
  timezone: "America/Bahia",
  attendeeEmails: ["ana@example.com"],
  createMeet: false,
});

describe("reuniões", () => {
  it("cria e lista reuniões apenas para membros do workspace", async () => {
    const created = await createMeeting(input(), ownerId);
    expect(created.title).toBe("Alinhamento semanal");
    expect(created.organizerId).toBe(ownerId);
    expect(await listMeetings(memberId)).toHaveLength(1);

    const outsider = await prisma.user.create({
      data: { name: "Externo", email: "externo@flow.app", avatarColor: "#111111" },
    });
    expect(await listMeetings(outsider.id)).toEqual([]);
  });

  it("não permite que viewer crie uma reunião", async () => {
    await expect(createMeeting(input(), viewerId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("somente o organizador edita ou cancela", async () => {
    const created = await createMeeting(input(), ownerId);
    await expect(
      updateMeeting(created.id, { title: "Tentativa" }, memberId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelMeeting(created.id, memberId)).rejects.toBeInstanceOf(NotFoundError);

    const updated = await updateMeeting(created.id, { title: "Novo título" }, ownerId);
    expect(updated.title).toBe("Novo título");
    await cancelMeeting(created.id, ownerId);
    expect(
      (await prisma.meeting.findUniqueOrThrow({ where: { id: created.id } })).cancelledAt,
    ).toBeTruthy();
  });
});
