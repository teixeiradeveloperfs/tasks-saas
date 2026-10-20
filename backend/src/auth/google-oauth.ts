import { OAuth2Client } from "google-auth-library";

import { prisma } from "@/db/client";
import { getEnv } from "@/config/env";

export type GoogleIdentity = {
  subject: string;
  email: string;
  name: string;
};

export class GoogleAuthError extends Error {
  statusCode = 401;
  statusMessage = "Não foi possível autenticar com o Google.";
}

function config() {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth não configurado.");
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  };
}

function client() {
  const { clientId, clientSecret, redirectUri } = config();
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export function googleAuthorizationUrl(state: string, nonce: string): string {
  return client().generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    nonce,
    prompt: "select_account",
  });
}

export async function exchangeGoogleCode(code: string, expectedNonce: string) {
  const { clientId, redirectUri } = config();
  const oauth = client();
  const { tokens } = await oauth.getToken({ code, redirect_uri: redirectUri });
  if (!tokens.id_token) throw new GoogleAuthError();
  const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
  const payload = ticket.getPayload();
  if (
    !payload?.sub ||
    !payload.email ||
    payload.email_verified !== true ||
    payload.nonce !== expectedNonce
  ) {
    throw new GoogleAuthError();
  }
  return {
    subject: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: payload.name?.trim() || payload.email.split("@")[0],
  } satisfies GoogleIdentity;
}

/** Vincula por e-mail verificado ou cria uma conta com workspace próprio. */
export async function findOrCreateGoogleUser(identity: GoogleIdentity) {
  return prisma.$transaction(async (tx) => {
    const [bySubject, byEmail] = await Promise.all([
      tx.user.findUnique({ where: { googleSubject: identity.subject } }),
      tx.user.findUnique({ where: { email: identity.email } }),
    ]);
    if (bySubject && byEmail && bySubject.id !== byEmail.id) throw new GoogleAuthError();
    if (bySubject) return bySubject;
    if (byEmail) {
      return tx.user.update({
        where: { id: byEmail.id },
        data: { googleSubject: identity.subject },
      });
    }

    const created = await tx.user.create({
      data: {
        name: identity.name,
        email: identity.email,
        googleSubject: identity.subject,
        avatarColor: "#0086f2",
      },
    });
    await tx.workspace.create({
      data: {
        name: `${identity.name} — Workspace`,
        color: "#0086f2",
        members: { create: { userId: created.id, title: "Owner", permission: "OWNER" } },
        projects: {
          create: {
            name: "Projeto padrão",
            color: created.avatarColor,
            boardColumns: {
              create: [
                { name: "A fazer", status: "todo", color: "#94a3b8", position: 0 },
                { name: "Em progresso", status: "in_progress", color: "#0086f2", position: 1 },
                { name: "Concluído", status: "done", color: "#22c55e", position: 2 },
              ],
            },
          },
        },
      },
    });
    return created;
  });
}
