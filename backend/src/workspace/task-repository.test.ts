import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import {
  addBlocker,
  addComment,
  addSubtask,
  addTimeEntry,
  createTask,
  deleteComment,
  deleteTask,
  removeBlocker,
  removeSubtask,
  removeTimeEntry,
  renameSubtask,
  setEstimate,
  setFieldValue,
  toggleSubtask,
  moveTask,
  updateTask,
} from "@/workspace/task-repository";
import { seed } from "../../prisma/seed";
import { NotFoundError } from "@/auth/authorization";
import { createWorkspace } from "@/workspace/workspace-repository";

let workspaceId: string;
let authorId: string;
let anaId: string;
let sprintId: string;

beforeEach(async () => {
  await resetDatabase();
  const { users, workspaces } = await seed();
  workspaceId = workspaces.acme.id;
  authorId = users.voce.id;
  anaId = users.ana.id;
  sprintId = (await prisma.sprint.findFirstOrThrow({ where: { workspaceId, name: "Sprint 12" } }))
    .id;
});

describe("createTask", () => {
  it("grava a tarefa e devolve o tipo de domínio", async () => {
    const task = await createTask({ workspaceId, title: "Nova tarefa" }, authorId);

    expect(task.id).toBeTruthy();
    expect(task.title).toBe("Nova tarefa");
    expect(task.status).toBe("todo");
    expect(task.priority).toBe("medium");
    expect(await prisma.task.count({ where: { workspaceId } })).toBe(4);
  });

  it("registra a atividade de criação com o autor", async () => {
    const task = await createTask({ workspaceId, title: "Com atividade" }, authorId);

    expect(task.activity).toHaveLength(1);
    expect(task.activity[0].kind).toBe("created");
    expect(task.activity[0].text).toBe("criou a tarefa");
    expect(task.activity[0].author).toBe("Você");
  });

  it("persiste subtarefas recebidas junto com uma tarefa nova", async () => {
    const task = await createTask(
      {
        workspaceId,
        title: "Publicar aplicação",
        subtaskTitles: ["Gerar build", "Executar smoke test"],
      },
      authorId,
    );

    expect(task.subtasks.map((subtask) => subtask.title)).toEqual([
      "Gerar build",
      "Executar smoke test",
    ]);
    expect(task.subtasks.every((subtask) => !subtask.done)).toBe(true);
  });

  it("liga as etiquetas por id a partir dos nomes que a interface envia", async () => {
    const task = await createTask(
      { workspaceId, title: "Com etiquetas", labels: ["urgente", "design"] },
      authorId,
    );

    expect(task.labels.sort()).toEqual(["design", "urgente"]);
  });

  it("ignora nome de etiqueta que não existe no workspace", async () => {
    const task = await createTask(
      { workspaceId, title: "Etiqueta fantasma", labels: ["urgente", "inexistente"] },
      authorId,
    );

    expect(task.labels).toEqual(["urgente"]);
  });

  it("permite cadastrar e atualizar vários responsáveis", async () => {
    const task = await createTask(
      {
        workspaceId,
        title: "Tarefa compartilhada",
        assigneeIds: [authorId, anaId],
      },
      authorId,
    );

    expect(task.assigneeIds).toEqual([authorId, anaId]);
    expect(await prisma.taskAssignment.count({ where: { taskId: task.id } })).toBe(2);

    const updated = await updateTask(task.id, { assigneeIds: [anaId] }, authorId);
    expect(updated.assigneeIds).toEqual([anaId]);
    expect(updated.assigneeId).toBe(anaId);
  });
});

describe("autorização por workspace", () => {
  it("impede outro membro de ler ou alterar tarefas do workspace", async () => {
    const outroWorkspace = await createWorkspace(
      { name: "Workspace da Ana", color: "#123456" },
      anaId,
    );
    const tarefa = await createTask(
      { workspaceId: outroWorkspace.id, title: "Privada da Ana" },
      anaId,
    );

    await expect(updateTask(tarefa.id, { title: "Alterada" }, authorId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(deleteTask(tarefa.id, authorId)).rejects.toBeInstanceOf(NotFoundError);
    expect(await prisma.task.findUnique({ where: { id: tarefa.id } })).not.toBeNull();
  });
});

describe("updateTask", () => {
  it("altera os campos enviados e preserva os demais", async () => {
    const criada = await createTask(
      { workspaceId, title: "Original", description: "mantida" },
      authorId,
    );

    const alterada = await updateTask(criada.id, { title: "Renomeada" }, authorId);

    expect(alterada.title).toBe("Renomeada");
    expect(alterada.description).toBe("mantida");
  });

  it("registra atividade de status, prioridade e responsável", async () => {
    const criada = await createTask({ workspaceId, title: "Histórico" }, authorId);

    const alterada = await updateTask(
      criada.id,
      { status: "in_progress", priority: "high", assigneeId: anaId },
      authorId,
    );

    const textos = alterada.activity.map((item) => item.text);
    expect(textos).toContain('mudou status para "Em progresso"');
    expect(textos).toContain('mudou prioridade para "Alta"');
    expect(textos).toContain("atribuiu a Ana Souza");
  });

  it("não registra atividade quando o valor não mudou", async () => {
    const criada = await createTask({ workspaceId, title: "Sem mudança" }, authorId);

    const alterada = await updateTask(criada.id, { status: "todo", priority: "medium" }, authorId);

    expect(alterada.activity).toHaveLength(1);
  });

  it("substitui as etiquetas em vez de acumular", async () => {
    const criada = await createTask(
      { workspaceId, title: "Troca etiquetas", labels: ["urgente"] },
      authorId,
    );

    const alterada = await updateTask(criada.id, { labels: ["design"] }, authorId);

    expect(alterada.labels).toEqual(["design"]);
  });

  it("move para sprint e registra a atividade", async () => {
    const criada = await createTask({ workspaceId, title: "Para o sprint" }, authorId);

    const alterada = await updateTask(criada.id, { sprintId }, authorId);

    expect(alterada.sprintId).toBe(sprintId);
    expect(alterada.activity.map((item) => item.text)).toContain("adicionou ao sprint");
  });
});

describe("moveTask", () => {
  it("muda o status e registra a atividade", async () => {
    const criada = await createTask({ workspaceId, title: "Mover" }, authorId);

    const movida = await moveTask(criada.id, "done", authorId);

    expect(movida.status).toBe("done");
    expect(movida.activity.map((item) => item.text)).toContain('moveu para "Concluído"');
  });

  it("não registra nada quando o status já é o pedido", async () => {
    const criada = await createTask({ workspaceId, title: "Parada" }, authorId);

    const movida = await moveTask(criada.id, "todo", authorId);

    expect(movida.activity).toHaveLength(1);
  });

  it("aplica a automação do workspace na mesma transação", async () => {
    // O seed traz a automação desligada. Ligada, ela remove a tarefa do sprint ao concluir.
    await prisma.automation.updateMany({ where: { workspaceId }, data: { enabled: true } });

    const criada = await createTask({ workspaceId, title: "Com automação", sprintId }, authorId);
    const movida = await moveTask(criada.id, "done", authorId);

    expect(movida.sprintId).toBeUndefined();
    expect(movida.activity.map((item) => item.text)).toContain("automação: removeu do sprint");
  });

  it("não aplica automação desligada", async () => {
    const criada = await createTask({ workspaceId, title: "Sem automação", sprintId }, authorId);

    const movida = await moveTask(criada.id, "done", authorId);

    expect(movida.sprintId).toBe(sprintId);
  });
});

describe("deleteTask", () => {
  it("remove a tarefa", async () => {
    const criada = await createTask({ workspaceId, title: "Para excluir" }, authorId);

    await deleteTask(criada.id);

    expect(await prisma.task.findUnique({ where: { id: criada.id } })).toBeNull();
  });

  it("leva junto comentários, subtarefas e atividades por cascata", async () => {
    const criada = await createTask({ workspaceId, title: "Com dependentes" }, authorId);
    await prisma.comment.create({
      data: { taskId: criada.id, authorId, text: "comentário" },
    });
    await prisma.subtask.create({ data: { taskId: criada.id, title: "sub", position: 0 } });

    await deleteTask(criada.id);

    expect(await prisma.comment.count({ where: { taskId: criada.id } })).toBe(0);
    expect(await prisma.subtask.count({ where: { taskId: criada.id } })).toBe(0);
    expect(await prisma.activity.count({ where: { taskId: criada.id } })).toBe(0);
  });

  it("desfaz o bloqueio que outra tarefa tinha nela", async () => {
    const bloqueadora = await createTask({ workspaceId, title: "Bloqueadora" }, authorId);
    const bloqueada = await createTask({ workspaceId, title: "Bloqueada" }, authorId);
    await prisma.taskBlocker.create({
      data: { taskId: bloqueada.id, blockedByTaskId: bloqueadora.id },
    });

    await deleteTask(bloqueadora.id);

    expect(await prisma.taskBlocker.count({ where: { taskId: bloqueada.id } })).toBe(0);
  });
});

describe("detalhe da tarefa", () => {
  it("persiste comentário, subtarefa, tempo e estimativa", async () => {
    const task = await createTask({ workspaceId, title: "Detalhada" }, authorId);
    const comentada = await addComment(task.id, "Comentário persistido", authorId);
    expect(comentada.comments[0].text).toBe("Comentário persistido");

    const comSubtask = await addSubtask(task.id, "Subtarefa", authorId);
    const subtaskId = comSubtask.subtasks[0].id;
    await renameSubtask(task.id, subtaskId, "Subtarefa renomeada");
    const concluida = await toggleSubtask(task.id, subtaskId, authorId);
    expect(concluida.subtasks[0]).toMatchObject({ title: "Subtarefa renomeada", done: true });

    const comTempo = await addTimeEntry(task.id, 45, "foco", authorId);
    expect(comTempo.timeEntries[0].minutes).toBe(45);
    expect((await setEstimate(task.id, 120)).estimateMinutes).toBe(120);
  });

  it("persiste campos customizados e bloqueios", async () => {
    const field = await prisma.customField.findFirstOrThrow({
      where: { workspaceId, name: "Área" },
    });
    const task = await createTask({ workspaceId, title: "Bloqueada" }, authorId);
    const blocker = await createTask({ workspaceId, title: "Bloqueadora" }, authorId);

    expect((await setFieldValue(task.id, field.id, "alta")).customFields[field.id]).toBe("alta");
    expect((await addBlocker(task.id, blocker.id, authorId)).blockedBy).toContain(blocker.id);
    expect((await removeBlocker(task.id, blocker.id)).blockedBy).not.toContain(blocker.id);

    const comment = await addComment(task.id, "a remover", authorId);
    await deleteComment(task.id, comment.comments[0].id);
    const withSubtask = await addSubtask(task.id, "a remover", authorId);
    await removeSubtask(task.id, withSubtask.subtasks[0].id);
    const withTime = await addTimeEntry(task.id, 10, undefined, authorId);
    await removeTimeEntry(task.id, withTime.timeEntries[0].id);
  });
});
