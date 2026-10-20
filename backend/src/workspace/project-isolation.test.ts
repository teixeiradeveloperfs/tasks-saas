import { beforeEach, describe, expect, it } from "vitest";

import { NotFoundError } from "@/auth/authorization";
import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import { listAuditEvents, undoAuditEvent } from "@/workspace/audit-repository";
import { readBoardDataForUser, readWorkspaceTasksPage } from "@/workspace/repository";
import {
  createRunbook,
  deleteRunbook,
  toggleRunbookFavorite,
} from "@/workspace/runbook-repository";
import { createTask, moveTaskToColumn, updateTask } from "@/workspace/task-repository";
import {
  createBoardColumn,
  createProject,
  createSprint,
  deleteDoc,
  deleteGoal,
  deleteSprint,
  updateDoc,
  updateGoal,
  updateMember,
  updateSprint,
} from "@/workspace/workspace-repository";
import { seed } from "../../prisma/seed";

/**
 * Isolamento entre projetos do MESMO workspace.
 *
 * O arquivo irmão `authorization-isolation.test.ts` cobre o corte entre workspaces.
 * Aqui as duas pessoas são membros do mesmo workspace: o que separa uma da outra é
 * apenas a concessão de projeto. Todas as recusas devem ser 404, e não 403 — revelar
 * que o recurso existe já entregaria o que se quer esconder.
 */
let ownerId: string;
let outsiderId: string;
let workspaceId: string;
let openProjectId: string;
let secretProjectId: string;
let secretTaskId: string;
let secretSprintId: string;
let secretDocId: string;
let secretGoalId: string;
let secretRunbookId: string;
let secretColumnId: string;

async function expectNotFound(operation: Promise<unknown>) {
  try {
    await operation;
    expect.fail("A operação sobre projeto sem acesso deveria ter sido rejeitada.");
  } catch (error) {
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toMatchObject({ statusCode: 404 });
  }
}

beforeEach(async () => {
  await resetDatabase();
  const { users, workspaces } = await seed();
  ownerId = users.voce.id;
  outsiderId = users.ana.id;
  workspaceId = workspaces.acme.id;

  const open = await prisma.project.findFirstOrThrow({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });
  openProjectId = open.id;

  const secret = await createProject(
    workspaceId,
    { name: "Confidencial", color: "#111111" },
    ownerId,
  );
  secretProjectId = secret.project.id;

  // Ana continua membro do workspace, mas só enxerga o projeto aberto.
  await updateMember(workspaceId, outsiderId, { projectIds: [openProjectId] }, ownerId);

  const task = await createTask(
    { workspaceId, projectId: secretProjectId, title: "Tarefa confidencial" },
    ownerId,
  );
  secretTaskId = task.id;

  const sprint = await createSprint({
    userId: ownerId,
    workspaceId,
    projectId: secretProjectId,
    name: "Sprint confidencial",
  });
  secretSprintId = sprint.sprint.id;

  const doc = await prisma.doc.create({
    data: { workspaceId, projectId: secretProjectId, title: "Doc confidencial", body: "" },
  });
  secretDocId = doc.id;

  const goal = await prisma.goal.create({
    data: { workspaceId, projectId: secretProjectId, name: "Meta confidencial" },
  });
  secretGoalId = goal.id;

  const runbook = await createRunbook(
    workspaceId,
    {
      projectId: secretProjectId,
      title: "Runbook confidencial",
      description: "",
      category: "deploy",
      environment: "producao",
      tags: [],
      steps: [
        { title: "Passo", command: "echo 1", explanation: "", expectedResult: "", risk: "safe" },
      ],
      variables: [],
    },
    ownerId,
  );
  secretRunbookId = runbook.runbook.id;

  const column = await prisma.boardColumn.findFirstOrThrow({
    where: { projectId: secretProjectId },
  });
  secretColumnId = column.id;
});

describe("leitura", () => {
  it("o board devolve apenas os projetos concedidos", async () => {
    const board = await readBoardDataForUser(outsiderId);
    const workspace = board.workspaces.find((item) => item.id === workspaceId);

    expect(workspace?.projects?.map((project) => project.id)).toEqual([openProjectId]);
  });

  it("o board não traz tarefas de projeto sem acesso", async () => {
    const board = await readBoardDataForUser(outsiderId);

    expect(board.tasks.map((task) => task.id)).not.toContain(secretTaskId);
  });

  it("o board não traz sprints, documentos, metas nem runbooks do projeto oculto", async () => {
    const board = await readBoardDataForUser(outsiderId);
    const workspace = board.workspaces.find((item) => item.id === workspaceId);

    expect(workspace?.sprints.map((item) => item.id)).not.toContain(secretSprintId);
    expect(workspace?.docs.map((item) => item.id)).not.toContain(secretDocId);
    expect(workspace?.goals.map((item) => item.id)).not.toContain(secretGoalId);
    expect(workspace?.runbooks.map((item) => item.id)).not.toContain(secretRunbookId);
  });

  it("quem administra continua enxergando tudo, sem depender de concessão", async () => {
    const board = await readBoardDataForUser(ownerId);
    const workspace = board.workspaces.find((item) => item.id === workspaceId);

    expect(workspace?.projects?.map((project) => project.id)).toContain(secretProjectId);
    expect(board.tasks.map((task) => task.id)).toContain(secretTaskId);
  });

  it("a paginação de tarefas também recorta por projeto", async () => {
    const page = await readWorkspaceTasksPage(workspaceId, outsiderId);

    expect(page.items.map((task) => task.id)).not.toContain(secretTaskId);
  });

  it("a auditoria esconde eventos de tarefas do projeto oculto", async () => {
    const events = await listAuditEvents(workspaceId, outsiderId);

    expect(events.items.some((event) => event.entityId === secretTaskId)).toBe(false);
  });
});

describe("escrita", () => {
  it("recusa alterar tarefa de projeto sem acesso", async () => {
    await expectNotFound(updateTask(secretTaskId, { title: "invadida" }, outsiderId));
  });

  it("recusa mover tarefa para coluna de projeto sem acesso", async () => {
    await expectNotFound(moveTaskToColumn(secretTaskId, secretColumnId, outsiderId));
  });

  it("recusa criar tarefa dentro de projeto sem acesso", async () => {
    await expectNotFound(
      createTask({ workspaceId, projectId: secretProjectId, title: "intrusa" }, outsiderId),
    );
  });

  it("recusa criar coluna em projeto sem acesso", async () => {
    await expectNotFound(
      createBoardColumn(secretProjectId, { name: "X", status: "todo", color: "#fff" }, outsiderId),
    );
  });

  it("recusa alterar e excluir sprint de projeto sem acesso", async () => {
    await expectNotFound(updateSprint(secretSprintId, { name: "invadido" }, outsiderId));
    await expectNotFound(deleteSprint(secretSprintId, outsiderId));
  });

  it("recusa alterar e excluir documento de projeto sem acesso", async () => {
    await expectNotFound(updateDoc(secretDocId, { title: "invadido" }, outsiderId));
    await expectNotFound(deleteDoc(secretDocId, outsiderId));
  });

  it("recusa alterar e excluir meta de projeto sem acesso", async () => {
    await expectNotFound(updateGoal(secretGoalId, { name: "invadida" }, outsiderId));
    await expectNotFound(deleteGoal(secretGoalId, outsiderId));
  });

  it("recusa favoritar e excluir runbook de projeto sem acesso", async () => {
    await expectNotFound(toggleRunbookFavorite(secretRunbookId, outsiderId));
    await expectNotFound(deleteRunbook(secretRunbookId, outsiderId));
  });

  it("recusa desfazer um evento de auditoria do projeto oculto", async () => {
    await updateTask(secretTaskId, { title: "Renomeada pelo dono" }, ownerId);
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: secretTaskId, action: "task.updated" },
    });

    await expectNotFound(undoAuditEvent(event.id, outsiderId));
  });

  it("recusa atribuir tarefa a quem não enxerga o projeto", async () => {
    await expectNotFound(
      createTask(
        { workspaceId, projectId: secretProjectId, title: "Para a Ana", assigneeId: outsiderId },
        ownerId,
      ),
    );
  });
});

describe("concessões", () => {
  it("conceder o projeto passa a revelá-lo, sem tocar em cargo", async () => {
    await updateMember(
      workspaceId,
      outsiderId,
      { projectIds: [openProjectId, secretProjectId] },
      ownerId,
    );

    const board = await readBoardDataForUser(outsiderId);
    const workspace = board.workspaces.find((item) => item.id === workspaceId);

    expect(workspace?.projects?.map((project) => project.id)).toContain(secretProjectId);
    expect(board.tasks.map((task) => task.id)).toContain(secretTaskId);
    expect(workspace?.members.find((member) => member.id === outsiderId)?.permission).toBe(
      "MEMBER",
    );
  });

  it("a lista enviada substitui a anterior, em vez de somar", async () => {
    await updateMember(workspaceId, outsiderId, { projectIds: [secretProjectId] }, ownerId);

    const board = await readBoardDataForUser(outsiderId);
    const workspace = board.workspaces.find((item) => item.id === workspaceId);

    expect(workspace?.projects?.map((project) => project.id)).toEqual([secretProjectId]);
  });

  it("um projeto de outro workspace não entra pela lista", async () => {
    const alheio = await prisma.project.findFirstOrThrow({
      where: { workspaceId: { not: workspaceId } },
    });

    await updateMember(workspaceId, outsiderId, { projectIds: [alheio.id] }, ownerId);

    const grants = await prisma.projectMember.findMany({
      where: { userId: outsiderId, projectId: alheio.id },
    });
    expect(grants).toHaveLength(0);
  });

  it("um projeto novo nasce restrito aos administradores", async () => {
    const novo = await createProject(workspaceId, { name: "Recente", color: "#222" }, ownerId);

    const board = await readBoardDataForUser(outsiderId);
    const workspace = board.workspaces.find((item) => item.id === workspaceId);

    expect(workspace?.projects?.map((project) => project.id)).not.toContain(novo.project.id);
  });

  it("remover o membro apaga as concessões, para readmissão não trazê-las de volta", async () => {
    const { removeMember } = await import("@/workspace/workspace-repository");
    await removeMember(workspaceId, outsiderId, ownerId);

    const grants = await prisma.projectMember.findMany({
      where: { userId: outsiderId, project: { workspaceId } },
    });
    expect(grants).toHaveLength(0);
  });
});
