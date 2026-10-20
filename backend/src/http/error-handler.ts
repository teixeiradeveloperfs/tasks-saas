import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";

type DomainError = Error & { statusCode?: number; statusMessage?: string; code?: string };

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | ZodError | DomainError, _request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: "Entrada inválida.", issues: error.issues });
      return;
    }

    const domain = error as DomainError;
    const statusCode = domain.statusCode ?? 500;

    if (statusCode >= 500) {
      app.log.error(error);
      reply.code(statusCode).send({ error: "Algo deu errado no servidor." });
      return;
    }

    // UnauthorizedError e NotFoundError trazem a frase em `statusMessage`; foram
    // construídas sem `message`, então cair direto em `error.message` responderia vazio.
    reply.code(statusCode).send({
      error: domain.statusMessage || domain.message,
      ...(domain.code ? { code: domain.code } : {}),
    });
  });
}
