import type { MeetingInput, MeetingPatch } from "@task-flow/shared/domain/meeting-contracts";

import { assertWorkspaceEditor, NotFoundError } from "@/auth/authorization";
import { prisma } from "@/db/client";
import { recordAudit } from "@/workspace/audit-repository";
import {
  createCalendarMeeting,
  deleteCalendarMeeting,
  updateCalendarMeeting,
} from "@/integrations/google-calendar";

type MeetingRecord = Awaited<ReturnType<typeof readMeetingRecord>>;

function mapMeeting(record: NonNullable<MeetingRecord>) {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    organizerId: record.organizerId,
    organizerName: record.organizer.name,
    title: record.title,
    description: record.description ?? undefined,
    startAt: record.startAt.toISOString(),
    endAt: record.endAt.toISOString(),
    timezone: record.timezone,
    attendeeEmails: record.attendeeEmails,
    meetUri: record.meetUri ?? undefined,
    cancelledAt: record.cancelledAt?.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

function readMeetingRecord(id: string) {
  return prisma.meeting.findUnique({ where: { id }, include: { organizer: true } });
}

export async function listMeetings(userId: string) {
  const records = await prisma.meeting.findMany({
    where: { workspace: { members: { some: { userId } } } },
    include: { organizer: true },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
  });
  return records.map(mapMeeting);
}

function calendarPayload(data: {
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  attendeeEmails: string[];
}) {
  return {
    title: data.title,
    description: data.description ?? undefined,
    startAt: data.startAt,
    endAt: data.endAt,
    timezone: data.timezone,
    attendeeEmails: data.attendeeEmails,
  };
}

export async function createMeeting(input: MeetingInput, userId: string) {
  await prisma.$transaction((tx) => assertWorkspaceEditor(tx, userId, input.workspaceId));
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const attendeeEmails = [...new Set(input.attendeeEmails.map((email) => email.toLowerCase()))];
  const calendar = input.createMeet
    ? await createCalendarMeeting(
        userId,
        calendarPayload({ ...input, startAt, endAt, attendeeEmails }),
      )
    : undefined;

  try {
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.meeting.create({
        data: {
          workspaceId: input.workspaceId,
          organizerId: userId,
          title: input.title,
          description: input.description ?? null,
          startAt,
          endAt,
          timezone: input.timezone,
          attendeeEmails,
          googleEventId: calendar?.eventId,
          calendarId: calendar ? "primary" : null,
          meetUri: calendar?.meetUri,
        },
        include: { organizer: true },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorId: userId,
        action: "meeting.created",
        entityType: "meeting",
        entityId: created.id,
        summary: `criou a reunião “${created.title}”`,
        after: created,
      });
      return created;
    });
    return mapMeeting(record);
  } catch (error) {
    if (calendar?.eventId)
      await deleteCalendarMeeting(userId, calendar.eventId).catch(() => undefined);
    throw error;
  }
}

export async function updateMeeting(id: string, patch: MeetingPatch, userId: string) {
  const current = await readMeetingRecord(id);
  if (!current || current.organizerId !== userId) throw new NotFoundError();
  await prisma.$transaction((tx) => assertWorkspaceEditor(tx, userId, current.workspaceId));
  const next = {
    title: patch.title ?? current.title,
    description: patch.description ?? current.description,
    startAt: patch.startAt ? new Date(patch.startAt) : current.startAt,
    endAt: patch.endAt ? new Date(patch.endAt) : current.endAt,
    timezone: patch.timezone ?? current.timezone,
    attendeeEmails:
      patch.attendeeEmails?.map((email) => email.toLowerCase()) ?? current.attendeeEmails,
  };
  if (next.endAt <= next.startAt) {
    const error = new Error("O término precisa ser posterior ao início.") as Error & {
      statusCode: number;
    };
    error.statusCode = 400;
    throw error;
  }
  let googleEventId = current.googleEventId;
  let meetUri = current.meetUri;
  if (current.googleEventId) {
    const calendar = await updateCalendarMeeting(
      userId,
      current.googleEventId,
      calendarPayload(next),
    );
    if (calendar.meetUri) meetUri = calendar.meetUri;
  } else if (patch.createMeet) {
    const calendar = await createCalendarMeeting(userId, calendarPayload(next));
    googleEventId = calendar.eventId;
    meetUri = calendar.meetUri ?? null;
  }
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.meeting.update({
      where: { id },
      data: {
        ...next,
        googleEventId,
        calendarId: googleEventId ? "primary" : null,
        meetUri,
      },
      include: { organizer: true },
    });
    await recordAudit(tx, {
      workspaceId: current.workspaceId,
      actorId: userId,
      action: "meeting.updated",
      entityType: "meeting",
      entityId: id,
      summary: `atualizou a reunião “${saved.title}”`,
      before: current,
      after: saved,
    });
    return saved;
  });
  return mapMeeting(updated);
}

export async function cancelMeeting(id: string, userId: string): Promise<void> {
  const current = await readMeetingRecord(id);
  if (!current || current.organizerId !== userId) throw new NotFoundError();
  if (current.googleEventId) {
    await deleteCalendarMeeting(userId, current.googleEventId).catch(() => undefined);
  }
  await prisma.$transaction(async (tx) => {
    const cancelled = await tx.meeting.update({ where: { id }, data: { cancelledAt: new Date() } });
    await recordAudit(tx, {
      workspaceId: current.workspaceId,
      actorId: userId,
      action: "meeting.cancelled",
      entityType: "meeting",
      entityId: id,
      summary: `cancelou a reunião “${current.title}”`,
      before: current,
      after: cancelled,
    });
  });
}
