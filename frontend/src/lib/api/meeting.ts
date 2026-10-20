import type {
  Meeting,
  MeetingConnection,
  MeetingInput,
  MeetingPatch,
} from "@task-flow/shared/domain/meeting-contracts";

import { api } from "./client";

export const listMeetings = (): Promise<Meeting[]> => api.get("/api/meetings");
export const calendarConnection = (): Promise<MeetingConnection> =>
  api.get("/api/integrations/google-calendar/status");
export const disconnectCalendar = (): Promise<void> =>
  api.delete("/api/integrations/google-calendar");
export const createMeeting = (data: MeetingInput): Promise<Meeting> =>
  api.post("/api/meetings", data);
export const updateMeeting = (id: string, patch: MeetingPatch): Promise<Meeting> =>
  api.patch(`/api/meetings/${id}`, patch);
export const cancelMeeting = (id: string): Promise<void> => api.delete(`/api/meetings/${id}`);
