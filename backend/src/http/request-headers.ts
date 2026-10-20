import type { FastifyRequest } from "fastify";

/** Converte os headers do Fastify no `Headers` que `resolveClientIp` espera. */
export function requestHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(",") : value);
  }
  return headers;
}
