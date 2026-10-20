import { createHash, randomUUID } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

import { getEnv } from "@/config/env";
import { prisma } from "@/db/client";
import { decryptToken, encryptToken } from "@/integrations/token-cipher";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export class GoogleCalendarUnavailableError extends Error {
  statusCode = 409;
  statusMessage = "Conecte seu Google Calendar antes de criar uma reunião com Meet.";
}

export class GoogleMeetGenerationError extends Error {
  statusCode = 422;
  statusMessage =
    "O Google criou o evento, mas não liberou um link do Meet para esta conta. Verifique as permissões do Google Workspace.";
}

function config() {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleCalendarUnavailableError();
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri:
      env.GOOGLE_CALENDAR_REDIRECT_URI ??
      new URL("/api/integrations/google-calendar/callback", env.APP_ORIGIN).toString(),
    encryptionKey:
      env.GOOGLE_TOKEN_ENCRYPTION_KEY ??
      createHash("sha256")
        .update(`automa-calendar-token-v1:${env.GOOGLE_CLIENT_SECRET}`)
        .digest("base64"),
  };
}

function oauthClient() {
  const value = config();
  return new OAuth2Client(value.clientId, value.clientSecret, value.redirectUri);
}

export function googleCalendarAuthorizationUrl(state: string, nonce: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent select_account",
    scope: ["openid", "email", CALENDAR_SCOPE],
    state,
    nonce,
  });
}

export async function connectGoogleCalendar(
  userId: string,
  code: string,
  expectedNonce: string,
): Promise<void> {
  const settings = config();
  const oauth = oauthClient();
  const { tokens } = await oauth.getToken({ code, redirect_uri: settings.redirectUri });
  if (!tokens.refresh_token || !tokens.id_token) throw new GoogleCalendarUnavailableError();
  const ticket = await oauth.verifyIdToken({
    idToken: tokens.id_token,
    audience: settings.clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.email || payload.email_verified !== true || payload.nonce !== expectedNonce) {
    throw new GoogleCalendarUnavailableError();
  }
  await prisma.googleCalendarConnection.upsert({
    where: { userId },
    create: {
      userId,
      googleEmail: payload.email.toLowerCase(),
      refreshTokenCipher: encryptToken(tokens.refresh_token, settings.encryptionKey),
      scopes: tokens.scope ?? CALENDAR_SCOPE,
    },
    update: {
      googleEmail: payload.email.toLowerCase(),
      refreshTokenCipher: encryptToken(tokens.refresh_token, settings.encryptionKey),
      scopes: tokens.scope ?? CALENDAR_SCOPE,
      connectedAt: new Date(),
    },
  });
}

export async function googleCalendarConnection(userId: string) {
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  return connection
    ? {
        connected: true as const,
        googleEmail: connection.googleEmail,
        connectedAt: connection.connectedAt.toISOString(),
      }
    : { connected: false as const };
}

export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  const settings = config();
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!connection) return;
  const token = decryptToken(connection.refreshTokenCipher, settings.encryptionKey);
  await oauthClient()
    .revokeToken(token)
    .catch(() => undefined);
  await prisma.googleCalendarConnection.delete({ where: { userId } });
}

async function authorizedClient(userId: string): Promise<OAuth2Client> {
  const settings = config();
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!connection) throw new GoogleCalendarUnavailableError();
  const oauth = oauthClient();
  oauth.setCredentials({
    refresh_token: decryptToken(connection.refreshTokenCipher, settings.encryptionKey),
  });
  return oauth;
}

export type CalendarMeeting = {
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  attendeeEmails: string[];
};

type GoogleEvent = { id?: string; hangoutLink?: string };

async function waitForMeetUri(oauth: OAuth2Client, eventId: string, initial?: string) {
  if (initial) return initial;
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const response = await oauth.request<GoogleEvent>({
      url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      method: "GET",
    });
    if (response.data.hangoutLink) return response.data.hangoutLink;
  }
  return undefined;
}

function eventBody(meeting: CalendarMeeting, createConference: boolean) {
  return {
    summary: meeting.title,
    description: meeting.description,
    start: { dateTime: meeting.startAt.toISOString(), timeZone: meeting.timezone },
    end: { dateTime: meeting.endAt.toISOString(), timeZone: meeting.timezone },
    attendees: meeting.attendeeEmails.map((email) => ({ email })),
    ...(createConference && {
      conferenceData: {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    }),
  };
}

export async function createCalendarMeeting(userId: string, meeting: CalendarMeeting) {
  const oauth = await authorizedClient(userId);
  const response = await oauth.request<GoogleEvent>({
    url: "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    method: "POST",
    params: { conferenceDataVersion: 1, sendUpdates: "all" },
    data: eventBody(meeting, true),
  });
  if (!response.data.id) throw new GoogleCalendarUnavailableError();
  const meetUri = await waitForMeetUri(oauth, response.data.id, response.data.hangoutLink);
  if (!meetUri) {
    await oauth
      .request({
        url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(response.data.id)}`,
        method: "DELETE",
        params: { sendUpdates: "none" },
      })
      .catch(() => undefined);
    throw new GoogleMeetGenerationError();
  }
  return {
    eventId: response.data.id,
    meetUri,
  };
}

export async function updateCalendarMeeting(
  userId: string,
  eventId: string,
  meeting: CalendarMeeting,
) {
  const oauth = await authorizedClient(userId);
  const response = await oauth.request<GoogleEvent>({
    url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    method: "PATCH",
    params: { conferenceDataVersion: 1, sendUpdates: "all" },
    data: eventBody(meeting, false),
  });
  return { meetUri: response.data.hangoutLink };
}

export async function deleteCalendarMeeting(userId: string, eventId: string): Promise<void> {
  const oauth = await authorizedClient(userId);
  await oauth.request({
    url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    method: "DELETE",
    params: { sendUpdates: "all" },
  });
}
