import { beforeEach, describe, expect, it } from "vitest";

import { NotFoundError, assertTaskMember, assertWorkspaceMember } from "@/auth/authorization";
import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import {
  addBlocker,
  createTask,
  deleteTask,
  setFieldValue,
  updateTask,
} from "@/workspace/task-repository";
import { togglePinTask, togglePinWorkspace } from "@/workspace/repository";
import {
  createWorkspace,
  deleteAutomation,
  deleteCustomField,
  deleteDoc,
  deleteGoal,
  deleteLabel,
  deleteSprint,
  deleteWorkspace,
  updateAutomation,
  updateCustomField,
  updateDoc,
  updateGoal,
  updateLabel,
  updateSprint,
  updateWorkspace,
  toggleGoalSprint,
  toggleGoalTask,
} from "@/workspace/workspace-repository";
import { seed } from "../../prisma/seed";

let attackerId: string;
let ownerId: string;
let victimWorkspaceId: string;
let victimTaskId: string;
let labelId: string;
let sprintId: string;
let customFieldId: string;
let docId: string;
let goalId: string;
let automationId: string;

async function expectNotFound(operation: Promise<unknown>) {
  try {
    await operation;
    expect.fail("A operação entre tenants deveria ter sido rejeitada.");
  } catch (error) {
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toMatchObject({ statusCode: 404 });
  }
}

beforeEach(async () => {
  await resetDatabase();
  const { users } = await seed();
  attackerId = users.voce.id;
  ownerId = users.ana.id;

  const victimWorkspace = await createWorkspace(
    { name: "Workspace privado da Ana", color: "#123456" },
    ownerId,
  );
  victimWorkspaceId = victimWorkspace.id;

  const task = await createTask(
    { workspaceId: victimWorkspaceId, title: "Tarefa privada" },
    ownerId,
  );
  const project = await prisma.project.findFirstOrThrow({
    where: { workspaceId: victimWorkspaceId },
  });
  const label = await prisma.label.create({
    data: { workspaceId: victimWorkspaceId, name: "Privada", color: "#abcdef" },
  });
  const sprint = await prisma.sprint.create({
    data: {
      workspaceId: victimWorkspaceId,
      projectId: project.id,
      name: "Sprint privado",
      status: "planned",
    },
  });
  const customField = await prisma.customField.create({
    data: { workspaceId: victimWorkspaceId, name: "Campo privado", type: "text", options: [] },
  });
  const doc = await prisma.doc.create({
    data: {
      workspaceId: victimWorkspaceId,
      projectId: project.id,
      title: "Documento privado",
      body: "segredo",
    },
  });
  const goal = await prisma.goal.create({
    data: { workspaceId: victimWorkspaceId, projectId: project.id, name: "Meta privada" },
  });
  const automation = await prisma.automation.create({
    data: {
      workspaceId: victimWorkspaceId,
      name: "Automação privada",
      enabled: true,
      trigger: { kind: "status_changed", to: "done" },
      action: { kind: "set_priority", priority: "high" },
    },
  });

  victimTaskId = task.id;
  labelId = label.id;
  sprintId = sprint.id;
  customFieldId = customField.id;
  docId = doc.id;
  goalId = goal.id;
  automationId = automation.id;
});

describe("isolamento multi-tenant", () => {
  it("nega a leitura da tarefa e do workspace de outro tenant com 404", async () => {
    await expectNotFound(
      prisma.$transaction((tx) => assertTaskMember(tx, attackerId, victimTaskId)),
    );
    await expectNotFound(
      prisma.$transaction((tx) => assertWorkspaceMember(tx, attackerId, victimWorkspaceId)),
    );
  });

  it("nega edição e exclusão da tarefa de outro tenant sem alterar os dados", async () => {
    await expectNotFound(updateTask(victimTaskId, { title: "Invadida" }, attackerId));
    await expectNotFound(deleteTask(victimTaskId, attackerId));

    const task = await prisma.task.findUniqueOrThrow({ where: { id: victimTaskId } });
    expect(task.title).toBe("Tarefa privada");
  });

  it("nega edição e exclusão do workspace de outro tenant", async () => {
    await expectNotFound(updateWorkspace(victimWorkspaceId, { name: "Invadido" }, attackerId));
    await expectNotFound(deleteWorkspace(victimWorkspaceId, attackerId));

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: victimWorkspaceId },
    });
    expect(workspace.name).toBe("Workspace privado da Ana");
  });

  it("nega edição dos recursos internos de outro workspace com 404", async () => {
    const operations = [
      () => updateLabel(labelId, { name: "Invadida" }, attackerId),
      () => updateSprint(sprintId, { name: "Invadido" }, attackerId),
      () => updateCustomField(customFieldId, { name: "Invadido" }, attackerId),
      () => updateDoc(docId, { title: "Invadido" }, attackerId),
      () => updateGoal(goalId, { name: "Invadida" }, attackerId),
      () => updateAutomation(automationId, { name: "Invadida" }, attackerId),
    ];

    for (const operation of operations) await expectNotFound(operation());

    expect(await prisma.label.findUniqueOrThrow({ where: { id: labelId } })).toMatchObject({
      name: "Privada",
    });
    expect(await prisma.sprint.findUniqueOrThrow({ where: { id: sprintId } })).toMatchObject({
      name: "Sprint privado",
    });
    expect(
      await prisma.customField.findUniqueOrThrow({ where: { id: customFieldId } }),
    ).toMatchObject({ name: "Campo privado" });
    expect(await prisma.doc.findUniqueOrThrow({ where: { id: docId } })).toMatchObject({
      title: "Documento privado",
    });
    expect(await prisma.goal.findUniqueOrThrow({ where: { id: goalId } })).toMatchObject({
      name: "Meta privada",
    });
    expect(
      await prisma.automation.findUniqueOrThrow({ where: { id: automationId } }),
    ).toMatchObject({ name: "Automação privada" });
  });

  it("nega exclusão dos recursos internos de outro workspace com 404", async () => {
    const operations = [
      () => deleteLabel(labelId, attackerId),
      () => deleteSprint(sprintId, attackerId),
      () => deleteCustomField(customFieldId, attackerId),
      () => deleteDoc(docId, attackerId),
      () => deleteGoal(goalId, attackerId),
      () => deleteAutomation(automationId, attackerId),
    ];

    for (const operation of operations) await expectNotFound(operation());

    expect(await prisma.label.count({ where: { id: labelId } })).toBe(1);
    expect(await prisma.sprint.count({ where: { id: sprintId } })).toBe(1);
    expect(await prisma.customField.count({ where: { id: customFieldId } })).toBe(1);
    expect(await prisma.doc.count({ where: { id: docId } })).toBe(1);
    expect(await prisma.goal.count({ where: { id: goalId } })).toBe(1);
    expect(await prisma.automation.count({ where: { id: automationId } })).toBe(1);
  });

  it("impede vínculos entre workspaces mesmo quando o usuário participa dos dois", async () => {
    const otherWorkspace = await prisma.workspace.findFirstOrThrow({
      where: { id: { not: victimWorkspaceId }, members: { some: { userId: ownerId } } },
    });
    const otherTask = await prisma.task.findFirstOrThrow({
      where: { workspaceId: otherWorkspace.id },
    });
    const otherSprint = await prisma.sprint.findFirstOrThrow({
      where: { workspaceId: otherWorkspace.id },
    });
    const otherField = await prisma.customField.findFirstOrThrow({
      where: { workspaceId: otherWorkspace.id },
    });

    await expectNotFound(toggleGoalTask(goalId, otherTask.id, ownerId));
    await expectNotFound(toggleGoalSprint(goalId, otherSprint.id, ownerId));
    await expectNotFound(setFieldValue(victimTaskId, otherField.id, "indevido", ownerId));
    await expectNotFound(addBlocker(victimTaskId, otherTask.id, ownerId));
  });

  it("impede favoritar recursos de workspace alheio", async () => {
    await expectNotFound(togglePinWorkspace(attackerId, victimWorkspaceId));
    await expectNotFound(togglePinTask(attackerId, victimTaskId));
  });
});
