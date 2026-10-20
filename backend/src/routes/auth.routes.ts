import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { credentials, signUpInput } from "@task-flow/shared/domain/auth-contracts";

import { AuthError, issueSession, rotateLoginSession, signIn, signUp } from "@/auth/authentication";
import { clearSessionCookie, readSessionCookie, writeSessionCookie } from "@/auth/cookie";
import { revokeSession } from "@/auth/session";
import { getEnv } from "@/config/env";
import { resolveClientIp } from "@/security/client-ip";
import { loginRateLimiter, signUpRateLimiter } from "@/security/login-rate-limit";
import { requestHeaders } from "@/http/request-headers";
import {
  exchangeGoogleCode,
  findOrCreateGoogleUser,
  googleAuthorizationUrl,
} from "@/auth/google-oauth";

const GOOGLE_STATE_COOKIE = "flow_google_state";
const GOOGLE_NONCE_COOKIE = "flow_google_nonce";
const GOOGLE_RETURN_COOKIE = "flow_google_return";
const GOOGLE_ERROR_COOKIE = "flow_google_error_path";
const GOOGLE_COOKIE_PATH = "/api/auth/google/callback";

function oauthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getEnv().NODE_ENV === "production",
    path: GOOGLE_COOKIE_PATH,
    maxAge: 10 * 60,
  };
}

function safeAppPath(value: string | undefined, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function sameOpaqueValue(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get("/api/auth/google/start", async (request, reply) => {
    const query = z
      .object({ returnTo: z.string().optional(), from: z.enum(["login", "signup"]).optional() })
      .parse(request.query);
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const options = oauthCookieOptions();
    reply.setCookie(GOOGLE_STATE_COOKIE, state, options);
    reply.setCookie(GOOGLE_NONCE_COOKIE, nonce, options);
    reply.setCookie(GOOGLE_RETURN_COOKIE, safeAppPath(query.returnTo, "/"), options);
    reply.setCookie(GOOGLE_ERROR_COOKIE, query.from === "signup" ? "/signup" : "/login", options);
    return reply.redirect(googleAuthorizationUrl(state, nonce));
  });

  app.get("/api/auth/google/callback", async (request, reply) => {
    const query = z
      .object({
        code: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
      })
      .parse(request.query);
    const options = oauthCookieOptions();
    const expectedState = request.cookies[GOOGLE_STATE_COOKIE];
    const expectedNonce = request.cookies[GOOGLE_NONCE_COOKIE];
    const returnTo = safeAppPath(request.cookies[GOOGLE_RETURN_COOKIE], "/");
    const errorPath = safeAppPath(request.cookies[GOOGLE_ERROR_COOKIE], "/login");
    for (const name of [
      GOOGLE_STATE_COOKIE,
      GOOGLE_NONCE_COOKIE,
      GOOGLE_RETURN_COOKIE,
      GOOGLE_ERROR_COOKIE,
    ]) {
      reply.clearCookie(name, options);
    }

    const errorUrl = new URL(errorPath, getEnv().APP_ORIGIN);
    if (
      query.error ||
      !query.code ||
      !sameOpaqueValue(query.state, expectedState) ||
      !expectedNonce
    ) {
      errorUrl.searchParams.set(
        "googleError",
        query.error === "access_denied" ? "cancelled" : "failed",
      );
      return reply.redirect(errorUrl.toString());
    }

    try {
      const identity = await exchangeGoogleCode(query.code, expectedNonce);
      const user = await findOrCreateGoogleUser(identity);
      const previous = readSessionCookie(request);
      const session = await issueSession(user.id, previous);
      writeSessionCookie(reply, session.token, session.session.expiresAt);
      return reply.redirect(new URL(returnTo, getEnv().APP_ORIGIN).toString());
    } catch {
      errorUrl.searchParams.set("googleError", "failed");
      return reply.redirect(errorUrl.toString());
    }
  });

  app.post("/api/auth/sign-up", async (request, reply) => {
    const data = signUpInput.parse(request.body);
    const clientIp = resolveClientIp(requestHeaders(request), getEnv().TRUSTED_PROXY_HEADER);
    const rateLimit = await signUpRateLimiter.consume({ email: data.email, clientIp });
    if (!rateLimit.allowed) {
      return reply
        .code(429)
        .header("retry-after", String(Math.ceil(rateLimit.retryAfterMs / 1000)))
        .send({ error: "Muitas tentativas de cadastro. Tente novamente mais tarde." });
    }
    try {
      const user = await signUp(data);
      const session = await issueSession(user.id);
      writeSessionCookie(reply, session.token, session.session.expiresAt);
      return { ok: true };
    } catch (error) {
      if (error instanceof AuthError) {
        return {
          ok: false,
          code: "sign_up_failed" as const,
          message: "Não foi possível concluir o cadastro com esses dados.",
        };
      }
      throw error;
    }
  });

  app.post("/api/auth/sign-in", async (request, reply) => {
    const data = credentials.parse(request.body);
    const clientIp = resolveClientIp(requestHeaders(request), getEnv().TRUSTED_PROXY_HEADER);
    const rateLimit = await loginRateLimiter.consume({ email: data.email, clientIp });

    // A recusa por excesso de tentativas responde igual à credencial errada, para
    // não revelar quais e-mails existem.
    if (!rateLimit.allowed) {
      return {
        ok: false,
        code: "invalid_credentials" as const,
        message: "E-mail ou senha inválidos.",
      };
    }

    try {
      const user = await signIn(data.email, data.password);
      const previous = readSessionCookie(request);
      const session = await rotateLoginSession(previous ?? "", user.id);
      writeSessionCookie(reply, session.token, session.session.expiresAt);
      return { ok: true };
    } catch (error) {
      if (error instanceof AuthError)
        return {
          ok: false,
          code: "invalid_credentials" as const,
          message: "E-mail ou senha inválidos.",
        };
      throw error;
    }
  });

  app.post("/api/auth/sign-out", async (request, reply) => {
    const token = readSessionCookie(request);
    if (token) await revokeSession(token);
    clearSessionCookie(reply);
    return { ok: true };
  });
}
