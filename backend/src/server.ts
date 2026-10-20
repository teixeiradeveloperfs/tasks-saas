import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { fileURLToPath } from "node:url";

import { getEnv } from "@/config/env";
import { assertNodeRuntime } from "@/config/runtime";
import { registerCsrfCheck } from "@/http/csrf";
import { registerErrorHandler } from "@/http/error-handler";
import { registerRateLimit } from "@/http/rate-limit-plugin";
import { registerSecurityHeaders } from "@/http/security-headers-plugin";
import { startNotificationScheduler } from "@/notifications/scheduler";
import { registerAuthRoutes } from "@/routes/auth.routes";
import { registerAiRoutes } from "@/routes/ai.routes";
import { registerInviteRoutes } from "@/routes/invite.routes";
import { registerGitHubRoutes } from "@/routes/github.routes";
import { registerMeetingRoutes } from "@/routes/meeting.routes";
import { registerProfileRoutes } from "@/routes/profile.routes";
import { registerPushRoutes } from "@/routes/push.routes";
import { registerSessionRoutes } from "@/routes/session.routes";
import { registerSharingRoutes } from "@/routes/sharing.routes";
import { registerTaskRoutes } from "@/routes/task.routes";
import { registerTwoFactorRoutes } from "@/routes/two-factor.routes";
import { registerVaultRoutes } from "@/routes/vault.routes";
import { registerWorkspaceRoutes } from "@/routes/workspace.routes";

assertNodeRuntime(process.release?.name);

const env = getEnv();
const isProduction = env.NODE_ENV === "production";

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

// O GitHub assina os bytes exatos enviados. Preservamos o buffer antes de fazer o
// mesmo JSON.parse que o parser padrão do Fastify faria para as demais rotas.
app.removeContentTypeParser("application/json");
app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
  const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
  request.rawBody = rawBody;
  // Requisição sem corpo não é corpo inválido. O cliente declara `content-type:
  // application/json` em toda chamada, inclusive nos POST sem payload — como o
  // início do cadastro de 2FA —, e tentar interpretar zero byte responderia 500.
  if (rawBody.length === 0) {
    done(null, undefined);
    return;
  }
  try {
    done(null, JSON.parse(rawBody.toString("utf8")));
  } catch (error) {
    done(error as Error, undefined);
  }
});

await app.register(cookie);
// A origem é exata (não refletida) e o cookie segue sameSite=lax. `credentials`
// também deixa explícito o comportamento correto se a API for exposta diretamente.
await app.register(cors, {
  origin: env.APP_ORIGIN,
  methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: true,
  maxAge: 600,
  strictPreflight: true,
});
await app.register(helmet, {
  // These policies are applied by our shared header helper so they can also be
  // unit-tested without booting Fastify. Helmet supplies the remaining safe defaults.
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: false,
  hsts: false,
  noSniff: false,
  referrerPolicy: false,
});

registerSecurityHeaders(app, isProduction);
registerRateLimit(app, env.TRUSTED_PROXY_HEADER);
registerCsrfCheck(app, env.APP_ORIGIN);
registerErrorHandler(app);

app.addHook("onSend", async (request, reply, payload) => {
  if (request.url.startsWith("/api/") && !reply.hasHeader("Cache-Control")) {
    reply.header("Cache-Control", "no-store");
  }
  return payload;
});

registerAuthRoutes(app);
registerAiRoutes(app);
registerSessionRoutes(app);
registerSharingRoutes(app);
registerInviteRoutes(app);
registerGitHubRoutes(app);
registerMeetingRoutes(app);
registerProfileRoutes(app);
registerPushRoutes(app);
registerTwoFactorRoutes(app);
registerVaultRoutes(app);
registerTaskRoutes(app);
registerWorkspaceRoutes(app);

// O build de produção gera o frontend em /frontend/dist. Servi-lo pelo mesmo
// processo mantém frontend e API no mesmo deploy e na mesma origem.
await app.register(fastifyStatic, {
  root: fileURLToPath(new URL("../../frontend/dist", import.meta.url)),
  prefix: "/",
});

// Rotas do React Router precisam retornar o index.html. Rotas inexistentes da
// API continuam respondendo JSON 404, em vez de receberem a aplicação web.
app.setNotFoundHandler((request, reply) => {
  const isApiRoute = request.url === "/api" || request.url.startsWith("/api/");

  if (request.method === "GET" && !isApiRoute) {
    return reply
      .header("Cache-Control", "no-cache, no-store, must-revalidate")
      .type("text/html; charset=utf-8")
      .sendFile("index.html");
  }

  return reply.code(404).send({
    message: `Route ${request.method}:${request.url} not found`,
    error: "Not Found",
    statusCode: 404,
  });
});

await app.listen({ port: env.PORT, host: "0.0.0.0" });
startNotificationScheduler(app.log);
