import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import { NotFoundError } from "@/auth/authorization";
import { createTask, moveTaskToColumn } from "@/workspace/task-repository";
import {
  addMember,
  createAutomation,
  createBoardColumn,
  createCustomField,
  createDoc,
  createGoal,
  createLabel,
  createProject,
  createSprint,
  createWorkspace,
  deleteCustomField,
  deleteAutomation,
  deleteDoc,
  deleteGoal,
  deleteLabel,
  deleteSprint,
  deleteWorkspace,
  removeMember,
  toggleGoalSprint,
  toggleGoalTask,
  updateLabel,
  updateCustomField,
  updateAutomation,
  updateDoc,
  updateGoal,
  updateSprint,
  updateMember,
  updateProject,
  updateWorkspace,
} from "@/workspace/workspace-repository";
import { seed } from "../../prisma/seed";

let acmeId: string;
let userId: string;
let anaId: string;

beforeEach(async () => {
  await resetDatabase();
  const { users, workspaces } = await seed();
  acmeId = workspaces.acme.id;
  userId = users.voce.id;
  anaId = users.ana.id;
});

describe("createWorkspace", () => {
  it("cria o workspace e devolve o tipo de domínio", async () => {
    const workspace = await createWorkspace({ name: "Novo", color: "#123456" }, userId);

    expect(workspace.id).toBeTruthy();
    expect(workspace.name).toBe("Novo");
    expect(workspace.labels).toEqual([]);
    expect(workspace.projects).toHaveLength(1);
    expect(workspace.projects?.[0].name).toBe("Projeto padrão");
    expect(workspace.projects?.[0].boardColumns).toHaveLength(3);
  });

  it("põe quem criou como Owner, senão ninguém enxergaria o que criou", async () => {
    const workspace = await createWorkspace({ name: "Meu", color: "#123456" }, userId);

    expect(workspace.members).toHaveLength(1);
    expect(workspace.members[0].id).toBe(userId);
    expect(workspace.members[0].role).toBe("Owner");
  });

  it("permite criar tarefa dentro dele logo em seguida", async () => {
    const workspace = await createWorkspace({ name: "Com tarefa", color: "#123456" }, userId);

    const task = await createTask({ workspaceId: workspace.id, title: "Primeira" }, userId);

    expect(task.workspaceId).toBe(workspace.id);
  });
});

describe("projetos", () => {
  it("cria e renomeia projetos dentro do workspace", async () => {
    const created = await createProject(acmeId, { name: "Novo produto", color: "#0086f2" }, userId);
    expect(created.project.name).toBe("Novo produto");
    expect(created.workspace.projects).toHaveLength(2);

    const updated = await updateProject(created.project.id, { name: "Produto principal" }, userId);
    expect(updated.project.name).toBe("Produto principal");
  });

  it("não permite vincular meta a tarefa de outro projeto", async () => {
    const project = await createProject(
      acmeId,
      { name: "Projeto isolado", color: "#22c55e" },
      userId,
    );
    const task = await createTask(
      { workspaceId: acmeId, projectId: project.project.id, title: "Tarefa isolada" },
      userId,
    );

    await expect(
      createGoal({
        workspaceId: acmeId,
        name: "Meta do projeto padrão",
        taskIds: [task.id],
        userId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cria uma coluna e move a tarefa para ela", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { workspaceId: acmeId } });
    const created = await createBoardColumn(
      project.id,
      { name: "Em revisão", status: "in_progress", color: "#f59e0b" },
      userId,
    );
    const task = await createTask(
      { workspaceId: acmeId, projectId: project.id, title: "Revisar coluna" },
      userId,
    );

    const moved = await moveTaskToColumn(task.id, created.column.id, userId);
    expect(moved.boardColumnId).toBe(created.column.id);
    expect(moved.status).toBe("in_progress");
  });
});

describe("updateWorkspace", () => {
  it("altera só o que foi enviado", async () => {
    const imageUrl = "data:image/jpeg;base64,YWJj";
    const alterado = await updateWorkspace(acmeId, { name: "Acme renomeada", imageUrl }, userId);

    expect(alterado.name).toBe("Acme renomeada");
    expect(alterado.imageUrl).toBe(imageUrl);
    expect(alterado.color).toBe("#0086f2");
    expect(alterado.description).toBe("Cliente principal — produto B2B");
  });
});

describe("deleteWorkspace", () => {
  it("leva junto tarefas, etiquetas e membresias por cascata", async () => {
    await deleteWorkspace(acmeId, userId);

    expect(await prisma.workspace.findUnique({ where: { id: acmeId } })).toBeNull();
    expect(await prisma.task.count({ where: { workspaceId: acmeId } })).toBe(0);
    expect(await prisma.label.count({ where: { workspaceId: acmeId } })).toBe(0);
    expect(await prisma.workspaceMember.count({ where: { workspaceId: acmeId } })).toBe(0);
  });

  it("não apaga os usuários que eram membros", async () => {
    await deleteWorkspace(acmeId, userId);

    expect(await prisma.user.count()).toBe(3);
  });
});

describe("etiquetas", () => {
  it("cria a etiqueta no workspace", async () => {
    const label = await createLabel(acmeId, "nova", "#000000", userId);

    expect(label.id).toBeTruthy();
    expect(label.name).toBe("nova");
  });

  it("recusa nome repetido no mesmo workspace", async () => {
    await expect(createLabel(acmeId, "urgente", "#000000", userId)).rejects.toThrow();
  });

  it("renomear é uma linha só, e as tarefas acompanham sozinhas", async () => {
    const original = await prisma.label.findFirstOrThrow({
      where: { workspaceId: acmeId, name: "urgente" },
    });

    await updateLabel(original.id, { name: "crítico" }, userId);

    const task = await prisma.task.findFirstOrThrow({
      where: { title: "Revisar proposta de contrato" },
      include: { labels: { include: { label: true } } },
    });
    expect(task.labels.map((l) => l.label.name).sort()).toEqual(["crítico", "jurídico"]);
  });

  it("excluir a etiqueta desliga ela das tarefas por cascata", async () => {
    const label = await prisma.label.findFirstOrThrow({
      where: { workspaceId: acmeId, name: "urgente" },
    });

    await deleteLabel(label.id, userId);

    expect(await prisma.taskLabel.count({ where: { labelId: label.id } })).toBe(0);
  });
});

describe("sprints", () => {
  it("cria, atualiza e exclui um sprint persistido", async () => {
    const created = await createSprint({
      userId,
      workspaceId: acmeId,
      name: "Sprint persistente",
      goal: "Entregar MVP",
      startDate: "2026-08-05T00:00:00.000Z",
      status: "active",
    });

    expect(created.sprint.name).toBe("Sprint persistente");
    expect(created.workspace.sprints.map((s) => s.id)).toContain(created.sprint.id);

    const updated = await updateSprint(
      created.sprint.id,
      { name: "Sprint renomeado", status: "closed" },
      userId,
    );
    expect(updated.sprint.name).toBe("Sprint renomeado");
    expect(updated.sprint.status).toBe("closed");

    await createTask(
      { workspaceId: acmeId, title: "Ligada ao sprint", sprintId: created.sprint.id },
      userId,
    );
    await deleteSprint(created.sprint.id, userId);
    expect(await prisma.sprint.findUnique({ where: { id: created.sprint.id } })).toBeNull();
    expect(
      await prisma.task.findFirstOrThrow({ where: { title: "Ligada ao sprint" } }),
    ).toMatchObject({ sprintId: null });
  });
});

describe("campos customizados", () => {
  it("cria, atualiza e exclui o campo e seus valores", async () => {
    const created = await createCustomField({
      userId,
      workspaceId: acmeId,
      name: "Risco",
      type: "select",
      options: ["baixo", "alto"],
    });
    const task = await createTask({ workspaceId: acmeId, title: "Com risco" }, userId);
    await prisma.taskFieldValue.create({
      data: { taskId: task.id, fieldId: created.field.id, valueText: "alto" },
    });

    const updated = await updateCustomField(
      created.field.id,
      { name: "Nível de risco", options: ["baixo", "alto", "crítico"] },
      userId,
    );
    expect(updated.field.name).toBe("Nível de risco");
    expect(updated.field.options).toEqual(["baixo", "alto", "crítico"]);

    await deleteCustomField(created.field.id, userId);
    expect(await prisma.customField.findUnique({ where: { id: created.field.id } })).toBeNull();
    expect(await prisma.taskFieldValue.count({ where: { fieldId: created.field.id } })).toBe(0);
  });
});

describe("membros", () => {
  it("cria um usuário de verdade para quem foi adicionado", async () => {
    const { member } = await addMember(
      acmeId,
      { name: "Carla Dias", email: "carla@acme.com", color: "#abcdef", role: "QA" },
      userId,
    );

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "carla@acme.com" } });
    expect(member.id).toBe(user.id);
    expect(user.name).toBe("Carla Dias");
  });

  it("reaproveita o usuário quando o e-mail já existe", async () => {
    const antes = await prisma.user.count();

    const { member } = await addMember(
      acmeId,
      { name: "Ana Souza", email: "ana@acme.com", color: "#abcdef" },
      userId,
    );

    expect(member.id).toBe(anaId);
    expect(await prisma.user.count()).toBe(antes);
  });

  it("o membro novo aparece no workspace devolvido", async () => {
    const { workspace } = await addMember(
      acmeId,
      { name: "Carla Dias", email: "carla@acme.com", color: "#abcdef" },
      userId,
    );

    expect(workspace.members.map((m) => m.name)).toContain("Carla Dias");
  });

  it("atualiza somente dados da membresia, sem mudar o perfil global", async () => {
    const workspace = await updateMember(acmeId, anaId, { role: "Lead" }, userId);

    const ana = workspace.members.find((m) => m.id === anaId);
    expect(ana?.name).toBe("Ana Souza");
    expect(ana?.role).toBe("Lead");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: anaId } })).toMatchObject({
      name: "Ana Souza",
      email: "ana@acme.com",
    });
  });

  it("remover tira a membresia mas preserva o usuário", async () => {
    const workspace = await removeMember(acmeId, anaId, userId);

    expect(workspace.members.map((m) => m.id)).not.toContain(anaId);
    expect(await prisma.user.findUnique({ where: { id: anaId } })).not.toBeNull();
  });

  it("remover deixa sem responsável as tarefas que eram dela", async () => {
    // A cascata do schema não cobre isto: o usuário continua existindo.
    await removeMember(acmeId, anaId, userId);

    expect(await prisma.task.count({ where: { workspaceId: acmeId, assigneeId: anaId } })).toBe(0);
  });

  it("não mexe em tarefas de outro workspace", async () => {
    const outro = await createWorkspace({ name: "Outro", color: "#000000" }, userId);
    await addMember(
      outro.id,
      { name: "Ana Souza", email: "ana@acme.com", color: "#ec4899" },
      userId,
    );
    const tarefa = await createTask(
      { workspaceId: outro.id, title: "Da Ana", assigneeId: anaId },
      userId,
    );

    await removeMember(acmeId, anaId, userId);

    const depois = await prisma.task.findUniqueOrThrow({ where: { id: tarefa.id } });
    expect(depois.assigneeId).toBe(anaId);
  });
});

describe("metas, documentos e automações", () => {
  it("persiste documento e meta com seus vínculos", async () => {
    const doc = await createDoc(acmeId, "Documento persistido", userId);
    expect(doc.doc.body).toBe("");
    expect((await updateDoc(doc.doc.id, { body: "Conteúdo" }, userId)).doc.body).toBe("Conteúdo");
    const storedDoc = await prisma.doc.findUniqueOrThrow({ where: { id: doc.doc.id } });
    expect(storedDoc.body).not.toContain("Conteúdo");
    const docAudit = await prisma.auditEvent.findMany({
      where: { entityType: "doc", entityId: doc.doc.id },
    });
    expect(JSON.stringify(docAudit)).not.toContain("Conteúdo");

    const task = await createTask({ workspaceId: acmeId, title: "Meta task" }, userId);
    const sprint = await prisma.sprint.findFirstOrThrow({ where: { workspaceId: acmeId } });
    const goal = await createGoal({
      userId,
      workspaceId: acmeId,
      name: "Objetivo",
      taskIds: [task.id],
      sprintIds: [sprint.id],
    });
    expect(goal.workspace.goals.find((g) => g.id === goal.goal.id)?.taskIds).toContain(task.id);
    await toggleGoalTask(goal.goal.id, task.id, userId);
    await toggleGoalSprint(goal.goal.id, sprint.id, userId);
    await updateGoal(goal.goal.id, { name: "Objetivo atualizado" }, userId);
    await deleteGoal(goal.goal.id, userId);
    await deleteDoc(doc.doc.id, userId);
    expect(await prisma.goal.count({ where: { id: goal.goal.id } })).toBe(0);
    expect(await prisma.doc.count({ where: { id: doc.doc.id } })).toBe(0);
  });

  it("valida e persiste a definição JSON de automação", async () => {
    const created = await createAutomation({
      userId,
      workspaceId: acmeId,
      name: "Ao concluir",
      trigger: { kind: "status_changed", to: "done" },
      action: { kind: "set_priority", priority: "high" },
    });
    const automation = created.workspace.automations.at(-1)!;
    expect(automation.name).toBe("Ao concluir");
    await updateAutomation(automation.id, { enabled: false }, userId);
    await deleteAutomation(automation.id, userId);
    expect(await prisma.automation.findUnique({ where: { id: automation.id } })).toBeNull();
  });
});
