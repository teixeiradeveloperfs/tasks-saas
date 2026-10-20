import type { FastifyRequest } from "fastify";

export class UnauthorizedError extends Error {
  statusCode = 401;
  statusMessage = "Autenticação necessária.";
}

/**
 * A identidade vem do `preHandler` de sessão, que já validou o token e anotou o
 * usuário na requisição. Antes cada chamada relia o cookie e consultava a sessão
 * de novo; com a requisição em mãos, a validação acontece uma vez por requisição.
 */
export function currentUserId(request: FastifyRequest): string {
  if (!request.userId) throw new UnauthorizedError();
  return request.userId;
}
