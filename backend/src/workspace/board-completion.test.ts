import { beforeEach, describe, expect, it } from "vitest";

import { NotFoundError } from "@/auth/authorization";
import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import { listAuditEvents, undoAuditEvent } from "@/workspace/audit-repository";
import {
  addAttachment,
  createTask,
  moveTask,
  readAttachment,
  removeAttachment,
  updateTask,
} from "@/workspace/task-repository";
import {
  createCustomField,
  createDoc,
  createGoal,
  createLabel,
  createSprint,
  updateMember,
} from "@/workspace/workspace-repository";
import { seed } from "../../prisma/seed";

let workspaceId: string;
let ownerId: string;
let viewerId: string;

beforeEach(async () => {
  await resetDatabase();
  const { users, workspaces } = await seed();
  workspaceId = workspaces.acme.id;
  ownerId = users.voce.id;
  viewerId = users.ana.id;
});

describe("conclusão funcional do Board", () => {
  it("persiste a ordem dentro de uma coluna e entre colunas", async () => {
    const first = await createTask({ workspaceId, title: "Primeira" }, ownerId);
    const second = await createTask({ workspaceId, title: "Segunda" }, ownerId);

    await moveTask(second.id, "todo", ownerId, first.position);
    const todo = await prisma.task.findMany({
      where: { workspaceId, status: "todo", id: { in: [first.id, second.id] } },
      orderBy: { position: "asc" },
    });
    expect(todo.map((task) => task.id)).toEqual([second.id, first.id]);

    await moveTask(second.id, "done", ownerId, 0);
    expect(await prisma.task.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({
      status: "done",
      position: 0,
    });
  });

  it("grava, baixa e remove anexos com os metadados da tarefa", async () => {
    const task = await createTask({ workspaceId, title: "Com arquivo" }, ownerId);
    const content = Buffer.from("arquivo de teste");
    const attached = await addAttachment(
      task.id,
      {
        name: "evidencia.txt",
        mimeType: "text/plain",
        size: content.byteLength,
        data: content.toString("base64"),
      },
      ownerId,
    );

    expect(attached.attachments).toMatchObject([{ name: "evidencia.txt", uploader: "Você" }]);
    const stored = await prisma.attachment.findUniqueOrThrow({
      where: { id: attached.attachments[0].id },
    });
    expect(Buffer.from(stored.data).includes(content)).toBe(false);
    const downloaded = await readAttachment(attached.attachments[0].id, ownerId);
    expect(Buffer.from(downloaded.data).toString()).toBe("arquivo de teste");

    const withoutAttachment = await removeAttachment(task.id, attached.attachments[0].id, ownerId);
    expect(withoutAttachment.attachments).toEqual([]);
  });

  it("impede usuário somente leitura de alterar tarefas", async () => {
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: viewerId } },
      data: { permission: "VIEWER" },
    });
    const task = await prisma.task.findFirstOrThrow({ where: { workspaceId } });

    await expect(
      updateTask(task.id, { title: "Alteração indevida" }, viewerId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createTask({ workspaceId, title: "Criação indevida" }, viewerId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("permite ao usuário somente leitura baixar, mas não remover anexos", async () => {
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: viewerId } },
      data: { permission: "VIEWER" },
    });
    const task = await createTask({ workspaceId, title: "Arquivo compartilhado" }, ownerId);
    const content = Buffer.from("conteúdo visível");
    const attached = await addAttachment(
      task.id,
      {
        name: "leitura.txt",
        mimeType: "text/plain",
        size: content.byteLength,
        data: content.toString("base64"),
      },
      ownerId,
    );

    const downloaded = await readAttachment(attached.attachments[0].id, viewerId);
    expect(Buffer.from(downloaded.data).toString()).toBe("conteúdo visível");
    await expect(
      removeAttachment(task.id, attached.attachments[0].id, viewerId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lista a auditoria e desfaz uma atualização de tarefa", async () => {
    const task = await createTask({ workspaceId, title: "Título original" }, ownerId);
    await updateTask(task.id, { title: "Título alterado", priority: "high" }, ownerId);

    const audit = await listAuditEvents(workspaceId, ownerId);
    const updateEvent = audit.items.find(
      (event) => event.action === "task.updated" && event.entityId === task.id,
    );
    expect(updateEvent).toMatchObject({ undoable: true, actor: "Você" });

    await undoAuditEvent(updateEvent!.id, ownerId);
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      title: "Título original",
      priority: "medium",
    });
  });

  it("audita os módulos funcionais do workspace", async () => {
    await createLabel(workspaceId, "auditada", "#123456", ownerId);
    await createSprint({ workspaceId, name: "Sprint auditado", userId: ownerId });
    await createCustomField({
      workspaceId,
      name: "Campo auditado",
      type: "text",
      userId: ownerId,
    });
    await createDoc(workspaceId, "Documento auditado", ownerId);
    await createGoal({ workspaceId, name: "Meta auditada", userId: ownerId });
    await updateMember(workspaceId, viewerId, { role: "Papel auditado" }, ownerId);

    const audit = await listAuditEvents(workspaceId, ownerId, undefined, 100);
    expect(audit.items.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "label.created",
        "sprint.created",
        "field.created",
        "doc.created",
        "goal.created",
        "member.updated",
      ]),
    );
  });
});
