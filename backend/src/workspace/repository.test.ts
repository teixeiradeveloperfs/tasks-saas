import { beforeEach, describe, expect, it } from "vitest";

import {
  markNotificationsRead,
  readBoardData,
  toggleIntegration,
  togglePinTask,
  togglePinWorkspace,
  updateIntegrationConfig,
  updateProfile,
} from "@/workspace/repository";
import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import { seed } from "../../prisma/seed";

describe("readBoardData", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seed();
  });

  it("mapeia o seed para o contrato serializável do frontend", async () => {
    const board = await readBoardData("voce@flow.app");

    expect(board.profile.id).toBeTruthy();
    expect(board.profile.email).toBe("voce@flow.app");
    expect(board.workspaces.map((workspace) => workspace.name)).toEqual([
      "Acme Inc.",
      "Projetos pessoais",
    ]);
    expect(board.tasks).toHaveLength(4);

    const contractTask = board.tasks.find((task) => task.title === "Revisar proposta de contrato");
    expect(contractTask?.labels).toEqual(["jurídico", "urgente"]);
    expect(contractTask?.subtasks.map((subtask) => [subtask.title, subtask.done])).toEqual([
      ["Ler v3", true],
      ["Marcar reunião", false],
    ]);
    expect(contractTask?.comments[0]?.author).toBe("Ana Souza");
    expect(board.integrations).toEqual({
      [board.workspaces[0].id]: [],
      [board.workspaces[1].id]: [],
    });
  });

  it("não expõe e-mails da equipe para membro ou visualizador", async () => {
    const ana = await prisma.user.findUniqueOrThrow({ where: { email: "ana@acme.com" } });
    const acme = await prisma.workspace.findFirstOrThrow({ where: { name: "Acme Inc." } });
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: acme.id, userId: ana.id } },
      data: { permission: "VIEWER" },
    });

    const board = await readBoardData("ana@acme.com");
    const workspace = board.workspaces.find((item) => item.id === acme.id)!;
    expect(workspace.members.find((member) => member.id === ana.id)?.email).toBe("ana@acme.com");
    expect(
      workspace.members.filter((member) => member.id !== ana.id).every((member) => !member.email),
    ).toBe(true);
  });

  it("persiste perfil, favoritos, notificações e integrações no snapshot", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "voce@flow.app" } });
    const workspace = await prisma.workspace.findFirstOrThrow({ where: { name: "Acme Inc." } });
    const task = await prisma.task.findFirstOrThrow({ where: { workspaceId: workspace.id } });

    const profileImage = "data:image/jpeg;base64,YWJj";
    const updatedProfile = await updateProfile(user.id, {
      name: "Você atualizado",
      email: "voce-atualizado@flow.app",
      bio: "Bio",
      avatarUrl: profileImage,
    });
    expect(updatedProfile).toMatchObject({
      name: "Você atualizado",
      email: "voce-atualizado@flow.app",
      avatarUrl: profileImage,
    });
    expect((await togglePinWorkspace(user.id, workspace.id)).pinnedWorkspaces).toContain(
      workspace.id,
    );
    expect((await togglePinTask(user.id, task.id)).pinnedTasks).toContain(task.id);
    expect((await markNotificationsRead(user.id)).notificationsReadAt).toBeTruthy();
    await toggleIntegration(
      workspace.id,
      {
        id: "github",
        name: "GitHub",
        category: "Desenvolvimento",
        config: { repository: "flow/app" },
      },
      user.id,
    );
    await updateIntegrationConfig(workspace.id, "github", { repository: "flow/web" }, user.id);

    const reloaded = await readBoardData("voce-atualizado@flow.app");
    expect(reloaded.integrations[workspace.id]).toMatchObject([
      { id: "github", config: { repository: "flow/web" } },
    ]);
    expect((await togglePinWorkspace(user.id, workspace.id)).pinnedWorkspaces).not.toContain(
      workspace.id,
    );
    expect((await togglePinTask(user.id, task.id)).pinnedTasks).not.toContain(task.id);
  });

  it("recusa trocar para um e-mail já cadastrado", async () => {
    const [user, existing] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: "voce@flow.app" } }),
      prisma.user.findUniqueOrThrow({ where: { email: "ana@acme.com" } }),
    ]);

    await expect(updateProfile(user.id, { email: existing.email })).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
