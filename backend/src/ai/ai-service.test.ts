import { describe, expect, it } from "vitest";

import {
  aiSafetyIdentifier,
  generateRunbookDraft,
  generateTaskDraft,
  type AiStructuredGenerator,
} from "@/ai/ai-service";

function fakeGenerator(value: unknown, capture?: { system?: string; user?: string }) {
  return {
    async generate<T>({ schema, system, user }: Parameters<AiStructuredGenerator["generate"]>[0]) {
      if (capture) {
        capture.system = system;
        capture.user = user;
      }
      return schema.parse(value) as T;
    },
  } satisfies AiStructuredGenerator;
}

describe("serviço de IA", () => {
  it("usa um identificador estável e não envia o id original", () => {
    const first = aiSafetyIdentifier("user-1");
    expect(first).toBe(aiSafetyIdentifier("user-1"));
    expect(first).not.toContain("user-1");
    expect(first).not.toBe(aiSafetyIdentifier("user-2"));
  });

  it("gera runbook estruturado e remove tags e variáveis duplicadas", async () => {
    const capture: { system?: string; user?: string } = {};
    const draft = await generateRunbookDraft(
      { workspaceId: "ws-1", prompt: "diagnosticar postgres" },
      { workspaceName: "Operações", projectName: "API" },
      "user-1",
      fakeGenerator(
        {
          title: "Diagnosticar PostgreSQL",
          description: "Verifica o serviço.",
          category: "Banco",
          environment: "Ubuntu",
          tags: ["postgres", "postgres"],
          variables: [
            { key: "SERVICE", defaultValue: "postgresql", description: "Serviço" },
            { key: "SERVICE", defaultValue: "postgresql", description: "Serviço" },
          ],
          steps: [
            {
              title: "Verificar status",
              command: "systemctl status {{SERVICE}}",
              explanation: "Mostra o estado.",
              expectedResult: "Serviço ativo.",
              risk: "safe",
            },
          ],
        },
        capture,
      ),
    );

    expect(draft.tags).toEqual(["postgres"]);
    expect(draft.variables).toHaveLength(1);
    expect(capture.system).toContain("Nunca inclua senhas");
    expect(capture.user).toContain('"workspace":"Operações"');
  });

  it("orienta a IA a dividir tarefas em passos verificáveis", async () => {
    const capture: { system?: string } = {};
    const result = await generateTaskDraft(
      {
        workspaceId: "ws-1",
        mode: "breakdown",
        current: { title: "Criar login", description: "", priority: "medium" },
      },
      { workspaceName: "Produto", labels: ["backend"] },
      "user-1",
      fakeGenerator(
        {
          title: "Implementar login",
          description: "- [ ] Criar endpoint\n- [ ] Testar sessão",
          priority: "medium",
          estimateMinutes: 120,
          subtasks: ["Criar endpoint", "Testar sessão"],
        },
        capture,
      ),
    );

    expect(result.estimateMinutes).toBe(120);
    expect(result.subtasks).toEqual(["Criar endpoint", "Testar sessão"]);
    expect(capture.system).toContain("campo subtasks");
  });
});
