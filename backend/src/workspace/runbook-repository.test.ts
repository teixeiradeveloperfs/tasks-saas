import { beforeEach, describe, expect, it } from "vitest";

import { NotFoundError } from "@/auth/authorization";
import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import {
  createRunbook,
  deleteRunbook,
  toggleRunbookFavorite,
  toggleRunbookStep,
  updateRunbook,
} from "@/workspace/runbook-repository";
import { createWorkspace } from "@/workspace/workspace-repository";
import { seed } from "../../prisma/seed";

let workspaceId: string;
let ownerId: string;
let viewerId: string;

const input = {
  title: "Diagnosticar PostgreSQL",
  description: "Investigar falhas na VPS.",
  category: "Banco de dados",
  environment: "Ubuntu",
  tags: ["postgres", "logs"],
  variables: [{ key: "SERVICE", defaultValue: "postgresql", description: "Nome do serviço" }],
  steps: [
    {
      title: "Acompanhar logs",
      command: "sudo journalctl -u {{SERVICE}} -f",
      explanation: "Mostra novas entradas do serviço.",
      expectedResult: "Logs aparecem em tempo real.",
      risk: "safe" as const,
    },
  ],
};

beforeEach(async () => {
  await resetDatabase();
  const { users, workspaces } = await seed();
  workspaceId = workspaces.acme.id;
  ownerId = users.voce.id;
  viewerId = users.bruno.id;
  await prisma.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId: viewerId } },
    data: { permission: "VIEWER" },
  });
});

describe("runbooks", () => {
  it("cria, atualiza e exclui um procedimento dentro do projeto", async () => {
    const created = await createRunbook(workspaceId, input, ownerId);
    expect(created.runbook).toMatchObject({
      title: input.title,
      category: input.category,
      favorite: false,
    });
    expect(created.runbook.steps[0]).toMatchObject({
      command: input.steps[0].command,
      position: 0,
    });
    expect(created.runbook.variables[0]).toMatchObject({ key: "SERVICE", position: 0 });

    const updated = await updateRunbook(
      created.runbook.id,
      { title: "Diagnosticar banco em produção", tags: ["produção"] },
      ownerId,
    );
    expect(updated.runbook.title).toBe("Diagnosticar banco em produção");
    expect(updated.runbook.steps).toHaveLength(1);

    await deleteRunbook(created.runbook.id, ownerId);
    expect(await prisma.runbook.findUnique({ where: { id: created.runbook.id } })).toBeNull();
  });

  it("permite ao viewer favoritar, mas não editar nem marcar checklist", async () => {
    const created = await createRunbook(workspaceId, input, ownerId);
    const favorited = await toggleRunbookFavorite(created.runbook.id, viewerId);
    expect(
      favorited.workspace.runbooks.find((item) => item.id === created.runbook.id)?.favorite,
    ).toBe(true);

    await expect(
      updateRunbook(created.runbook.id, { title: "Alterado" }, viewerId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(toggleRunbookStep(created.runbook.steps[0].id, viewerId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("isola runbooks de usuários que não pertencem ao workspace", async () => {
    const privateWorkspace = await createWorkspace(
      { name: "Infra privada", color: "#0086f2" },
      ownerId,
    );
    const created = await createRunbook(privateWorkspace.id, input, ownerId);

    await expect(toggleRunbookFavorite(created.runbook.id, viewerId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(deleteRunbook(created.runbook.id, viewerId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("marca e desmarca etapas para membros editores", async () => {
    const created = await createRunbook(workspaceId, input, ownerId);
    const first = await toggleRunbookStep(created.runbook.steps[0].id, ownerId);
    expect(first.workspace.runbooks[0].steps[0].checked).toBe(true);

    const second = await toggleRunbookStep(created.runbook.steps[0].id, ownerId);
    expect(second.workspace.runbooks[0].steps[0].checked).toBe(false);
  });
});
