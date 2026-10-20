import { beforeEach, describe, expect, it } from "vitest";

import { NotFoundError } from "@/auth/authorization";
import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import { readBoardDataForUser } from "@/workspace/repository";
import {
  createWhiteboard,
  deleteWhiteboard,
  readWhiteboard,
  updateWhiteboard,
} from "@/workspace/whiteboard-repository";
import { createProject, updateMember } from "@/workspace/workspace-repository";
import { seed } from "../../prisma/seed";

let ownerId: string;
let outsiderId: string;
let workspaceId: string;

async function expectNotFound(operation: Promise<unknown>) {
  try {
    await operation;
    expect.fail("A operação deveria ter sido rejeitada com 404.");
  } catch (error) {
    expect(error).toBeInstanceOf(NotFoundError);
  }
}

beforeEach(async () => {
  await resetDatabase();
  const { users, workspaces } = await seed();
  ownerId = users.voce.id;
  outsiderId = users.ana.id;
  workspaceId = workspaces.acme.id;
});

describe("quadros", () => {
  it("cria, salva a cena e lê de volta", async () => {
    const { whiteboard } = await createWhiteboard(workspaceId, { title: "Rascunho" }, ownerId);
    expect(whiteboard.title).toBe("Rascunho");

    const scene = JSON.stringify({ type: "excalidraw", elements: [{ id: "el1" }] });
    await updateWhiteboard(whiteboard.id, { scene }, ownerId);

    const loaded = await readWhiteboard(whiteboard.id, ownerId);
    expect(loaded.scene).toBe(scene);
  });

  it("guarda a cena criptografada em repouso", async () => {
    const { whiteboard } = await createWhiteboard(workspaceId, { title: "Sigiloso" }, ownerId);
    await updateWhiteboard(whiteboard.id, { scene: '{"elements":["segredo"]}' }, ownerId);

    const raw = await prisma.whiteboard.findUniqueOrThrow({ where: { id: whiteboard.id } });
    expect(raw.scene.startsWith("automa:enc:v1:")).toBe(true);
    expect(raw.scene).not.toContain("segredo");
  });

  it("aparece no board como metadado, sem a cena", async () => {
    const { whiteboard } = await createWhiteboard(workspaceId, { title: "No board" }, ownerId);

    const board = await readBoardDataForUser(ownerId);
    const workspace = board.workspaces.find((item) => item.id === workspaceId);
    const meta = workspace?.whiteboards.find((item) => item.id === whiteboard.id);

    expect(meta?.title).toBe("No board");
    expect(meta && "scene" in meta).toBe(false);
  });

  it("renomear audita; excluir remove", async () => {
    const { whiteboard } = await createWhiteboard(workspaceId, { title: "Antes" }, ownerId);
    await updateWhiteboard(whiteboard.id, { title: "Depois" }, ownerId);

    const audit = await prisma.auditEvent.findFirst({
      where: { entityType: "whiteboard", entityId: whiteboard.id, action: "whiteboard.updated" },
    });
    expect(audit?.summary).toContain("Depois");

    await deleteWhiteboard(whiteboard.id, ownerId);
    expect(await prisma.whiteboard.findUnique({ where: { id: whiteboard.id } })).toBeNull();
  });

  it("VIEWER lê, mas não altera nem exclui", async () => {
    const { whiteboard } = await createWhiteboard(workspaceId, { title: "Leitura" }, ownerId);
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: outsiderId } },
      data: { permission: "VIEWER" },
    });

    const loaded = await readWhiteboard(whiteboard.id, outsiderId);
    expect(loaded.title).toBe("Leitura");

    await expectNotFound(updateWhiteboard(whiteboard.id, { scene: "{}" }, outsiderId));
    await expectNotFound(deleteWhiteboard(whiteboard.id, outsiderId));
  });
});

describe("isolamento por projeto", () => {
  let secretProjectId: string;
  let secretBoardId: string;

  beforeEach(async () => {
    const openProject = await prisma.project.findFirstOrThrow({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });
    const secret = await createProject(
      workspaceId,
      { name: "Confidencial", color: "#111111" },
      ownerId,
    );
    secretProjectId = secret.project.id;
    await updateMember(workspaceId, outsiderId, { projectIds: [openProject.id] }, ownerId);

    const { whiteboard } = await createWhiteboard(
      workspaceId,
      { title: "Quadro secreto", projectId: secretProjectId },
      ownerId,
    );
    secretBoardId = whiteboard.id;
  });

  it("o board não lista quadros de projeto sem acesso", async () => {
    const board = await readBoardDataForUser(outsiderId);
    const workspace = board.workspaces.find((item) => item.id === workspaceId);

    expect(workspace?.whiteboards.map((item) => item.id)).not.toContain(secretBoardId);
  });

  it("recusa ler, alterar e excluir quadro de projeto sem acesso", async () => {
    await expectNotFound(readWhiteboard(secretBoardId, outsiderId));
    await expectNotFound(updateWhiteboard(secretBoardId, { scene: "{}" }, outsiderId));
    await expectNotFound(deleteWhiteboard(secretBoardId, outsiderId));
  });

  it("recusa criar quadro dentro de projeto sem acesso", async () => {
    await expectNotFound(
      createWhiteboard(workspaceId, { title: "Intruso", projectId: secretProjectId }, outsiderId),
    );
  });
});
