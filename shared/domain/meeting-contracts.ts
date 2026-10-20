import { z } from "zod";

const email = z.string().trim().email().max(320);

const meetingFields = {
  workspaceId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4_000).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().trim().min(1).max(100),
  attendeeEmails: z.array(email).max(100).default([]),
  createMeet: z.boolean().default(true),
};

export const meetingInput = z
  .object(meetingFields)
  .refine((value) => new Date(value.endAt) > new Date(value.startAt), {
    message: "O término precisa ser posterior ao início.",
    path: ["endAt"],
  });

export const meetingPatch = z.object(meetingFields).omit({ workspaceId: true }).partial();

export type MeetingInput = z.infer<typeof meetingInput>;
export type MeetingPatch = z.infer<typeof meetingPatch>;

export type Meeting = {
  id: string;
  workspaceId: string;
  organizerId: string;
  organizerName: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  timezone: string;
  attendeeEmails: string[];
  meetUri?: string;
  cancelledAt?: string;
  createdAt: string;
};

export type MeetingConnection = {
  connected: boolean;
  googleEmail?: string;
  connectedAt?: string;
};
