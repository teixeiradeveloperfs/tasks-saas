import type { FastifyInstance } from "fastify";

import { withSecurityHeaders } from "@/http/security-headers";

/** Applies the same security headers the old SSR boundary set, adapted to Fastify's reply API. */
export function registerSecurityHeaders(app: FastifyInstance, isProduction: boolean): void {
  const headers = withSecurityHeaders(new Response(null, { status: 200 }), isProduction).headers;

  app.addHook("onSend", async (_request, reply, payload) => {
    for (const [key, value] of headers) {
      reply.header(key, value);
    }
    return payload;
  });
}
