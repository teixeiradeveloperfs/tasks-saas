import { createHash } from "node:crypto";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import {
  runbookAiDraft,
  taskAiDraft,
  type RunbookAiDraft,
  type RunbookAiRequest,
  type TaskAiDraft,
  type TaskAiRequest,
} from "@task-flow/shared/domain/ai-contracts";

import { getEnv } from "@/config/env";

export class AiUnavailableError extends Error {
  statusCode = 503;
  statusMessage = "A IA ainda não foi configurada neste ambiente.";
}

export class AiGenerationError extends Error {
  statusCode = 502;
  statusMessage = "A IA não conseguiu gerar uma sugestão válida. Tente novamente.";
}

export interface AiStructuredGenerator {
  generate<T>(input: {
    schema: z.ZodType<T>;
    schemaName: string;
    system: string;
    user: string;
    safetyIdentifier: string;
  }): Promise<T>;
}

class OpenAiStructuredGenerator implements AiStructuredGenerator {
  private client: OpenAI | undefined;

  async generate<T>(input: {
    schema: z.ZodType<T>;
    schemaName: string;
    system: string;
    user: string;
    safetyIdentifier: string;
  }): Promise<T> {
    const env = getEnv();
    if (!env.OPENAI_API_KEY) throw new AiUnavailableError();
    this.client ??= new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: 25_000,
      maxRetries: 1,
    });
    try {
      const response = await this.client.responses.parse({
        model: env.OPENAI_MODEL ?? "gpt-5.6-luna",
        input: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        text: { format: zodTextFormat(input.schema, input.schemaName) },
        safety_identifier: input.safetyIdentifier,
      });
      const parsed = response.output_parsed;
      if (!parsed) throw new AiGenerationError();
      return input.schema.parse(parsed);
    } catch (error) {
      if (error instanceof AiUnavailableError || error instanceof AiGenerationError) throw error;
      throw new AiGenerationError();
    }
  }
}

const defaultGenerator = new OpenAiStructuredGenerator();

export function aiSafetyIdentifier(userId: string): string {
  return createHash("sha256").update(`automa-tasks:${userId}`).digest("hex");
}

export async function generateRunbookDraft(
  request: RunbookAiRequest,
  context: { workspaceName: string; projectName?: string },
  userId: string,
  generator: AiStructuredGenerator = defaultGenerator,
): Promise<RunbookAiDraft> {
  const draft = await generator.generate({
    schema: runbookAiDraft,
    schemaName: "runbook_draft",
    safetyIdentifier: aiSafetyIdentifier(userId),
    system: `Você é um assistente de operações defensivas para equipes de software.
Transforme a solicitação em um runbook prático, correto e conciso, escrito em português do Brasil.
Gere somente comandos pertinentes a administração legítima, diagnóstico, manutenção, deploy e recuperação.
Nunca inclua senhas, tokens, chaves privadas ou valores secretos. Transforme hostnames, nomes de containers,
bancos, usuários e domínios variáveis em placeholders no formato {{NOME_DA_VARIAVEL}} e declare cada variável.
Classifique cada comando como safe, caution ou dangerous. Comandos destrutivos devem ser dangerous e a
explicação precisa exigir conferência do alvo, backup e confirmação antes do uso.
Não afirme que um comando foi executado. Não use markdown fora dos campos estruturados.`,
    user: JSON.stringify({
      workspace: context.workspaceName,
      project: context.projectName,
      request: request.prompt,
      currentDraft: request.current,
    }),
  });
  return {
    ...draft,
    tags: [...new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))],
    variables: Array.from(
      new Map(draft.variables.map((variable) => [variable.key, variable])).values(),
    ),
  };
}

export async function generateTaskDraft(
  request: TaskAiRequest,
  context: { workspaceName: string; projectName?: string; labels: string[] },
  userId: string,
  generator: AiStructuredGenerator = defaultGenerator,
): Promise<TaskAiDraft> {
  const modeInstruction = {
    improve:
      "Melhore clareza, objetividade e critérios de conclusão sem mudar a intenção original.",
    rewrite:
      "Reescreva a tarefa com uma abordagem melhor, preservando o objetivo e eliminando ambiguidades.",
    breakdown:
      "Divida o trabalho no campo subtasks em etapas pequenas, distintas e verificáveis. Não repita essas etapas como checklist na descrição.",
  }[request.mode];

  return generator.generate({
    schema: taskAiDraft,
    schemaName: "task_draft",
    safetyIdentifier: aiSafetyIdentifier(userId),
    system: `Você ajuda equipes brasileiras a cadastrar tarefas acionáveis em um gerenciador de projetos.
${modeInstruction}
O título deve começar com verbo no infinitivo e ser curto. A descrição deve trazer contexto suficiente,
resultado esperado e, quando útil, critérios de aceite. Não invente pessoas, datas, links nem requisitos.
Escolha prioridade com moderação. A estimativa é em minutos e pode ser null quando não houver base.
Em subtasks, retorne somente ações realmente executáveis; use uma lista vazia se não houver subdivisão útil.
Não use campos fora da estrutura solicitada.`,
    user: JSON.stringify({
      workspace: context.workspaceName,
      project: context.projectName,
      availableLabels: context.labels,
      extraInstruction: request.prompt,
      currentTask: request.current,
    }),
  });
}
