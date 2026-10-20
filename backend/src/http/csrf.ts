import type { FastifyInstance } from "fastify";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Rejects unsafe-method requests whose Origin header doesn't match the trusted app origin. */
export function registerCsrfCheck(app: FastifyInstance, appOrigin: string): void {
  app.addHook("onRequest", async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;
    // O webhook não vem do navegador e é autenticado pela assinatura HMAC do GitHub.
    if (request.url.split("?")[0] === "/api/integrations/github/webhook") return;

    const origin = request.headers.origin;
    if (origin !== appOrigin) {
      return reply.code(403).send({ error: "Origem não confiável." });
    }
  });
}
