import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { meetingInput, meetingPatch } from "@task-flow/shared/domain/meeting-contracts";

import { requireSession } from "@/auth/require-session";
import { getEnv } from "@/config/env";
import { prisma } from "@/db/client";
import { notifyMeeting } from "@/notifications/push";
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  googleCalendarAuthorizationUrl,
  googleCalendarConnection,
} from "@/integrations/google-calendar";
import { currentUserId } from "@/workspace/current-user";
import {
  cancelMeeting,
  createMeeting,
  listMeetings,
  updateMeeting,
} from "@/workspace/meeting-repository";

const STATE_COOKIE = "automa_calendar_state";
const NONCE_COOKIE = "automa_calendar_nonce";
const RETURN_COOKIE = "automa_calendar_return";
const CALLBACK_PATH = "/api/integrations/google-calendar/callback";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getEnv().NODE_ENV === "production",
    path: CALLBACK_PATH,
    maxAge: 10 * 60,
  };
}

function safeAppPath(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/calendar";
}

function sameOpaqueValue(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerMeetingRoutes(app: FastifyInstance): void {
  app.register(async (authed) => {
    authed.addHook("preHandler", requireSession);

    authed.get("/api/integrations/google-calendar/start", async (request, reply) => {
      const query = z.object({ returnTo: z.string().optional() }).parse(request.query);
      const state = randomBytes(32).toString("base64url");
      const nonce = randomBytes(32).toString("base64url");
      const options = cookieOptions();
      reply.setCookie(STATE_COOKIE, state, options);
      reply.setCookie(NONCE_COOKIE, nonce, options);
      reply.setCookie(RETURN_COOKIE, safeAppPath(query.returnTo), options);
      return reply.redirect(googleCalendarAuthorizationUrl(state, nonce));
    });

    authed.get("/api/integrations/google-calendar/callback", async (request, reply) => {
      const query = z
        .object({
          code: z.string().optional(),
          state: z.string().optional(),
          error: z.string().optional(),
        })
        .parse(request.query);
      const options = cookieOptions();
      const expectedState = request.cookies[STATE_COOKIE];
      const expectedNonce = request.cookies[NONCE_COOKIE];
      const returnTo = safeAppPath(request.cookies[RETURN_COOKIE]);
      for (const name of [STATE_COOKIE, NONCE_COOKIE, RETURN_COOKIE]) {
        reply.clearCookie(name, options);
      }
      const destination = new URL(returnTo, getEnv().APP_ORIGIN);
      if (
        query.error ||
        !query.code ||
        !sameOpaqueValue(query.state, expectedState) ||
        !expectedNonce
      ) {
        destination.searchParams.set("calendar", "error");
        return reply.redirect(destination.toString());
      }
      try {
        await connectGoogleCalendar(currentUserId(request), query.code, expectedNonce);
        destination.searchParams.set("calendar", "connected");
      } catch {
        destination.searchParams.set("calendar", "error");
      }
      return reply.redirect(destination.toString());
    });

    authed.get("/api/integrations/google-calendar/status", async (request) =>
      googleCalendarConnection(currentUserId(request)),
    );

    authed.delete("/api/integrations/google-calendar", async (request, reply) => {
      await disconnectGoogleCalendar(currentUserId(request));
      reply.code(204).send();
    });

    authed.get("/api/meetings", async (request) => listMeetings(currentUserId(request)));

    authed.post("/api/meetings", async (request) => {
      const userId = currentUserId(request);
      const meeting = await createMeeting(meetingInput.parse(request.body), userId);
      void notifyMeeting(
        meeting,
        userId,
        "Você foi incluído em uma nova reunião.",
        `meeting-created:${meeting.id}`,
      ).catch((error) => request.log.error(error));
      return meeting;
    });

    authed.patch("/api/meetings/:id", async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const userId = currentUserId(request);
      const meeting = await updateMeeting(id, meetingPatch.parse(request.body), userId);
      void notifyMeeting(
        meeting,
        userId,
        "Os dados desta reunião foram atualizados.",
        `meeting-updated:${meeting.id}:${Date.now()}`,
      ).catch((error) => request.log.error(error));
      return meeting;
    });

    authed.delete("/api/meetings/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const userId = currentUserId(request);
      const meeting = await prisma.meeting.findUnique({ where: { id } });
      await cancelMeeting(id, userId);
      if (meeting) {
        void notifyMeeting(
          meeting,
          userId,
          "Esta reunião foi cancelada.",
          `meeting-cancelled:${meeting.id}`,
        ).catch((error) => request.log.error(error));
      }
      reply.code(204).send();
    });
  });
}
