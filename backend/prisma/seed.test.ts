import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import { seed } from "./seed";

describe("seed", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seed();
  });

  it("cria os três usuários", async () => {
    const users = await prisma.user.findMany({ orderBy: { email: "asc" } });
    expect(users.map((u) => u.email)).toEqual(["ana@acme.com", "bruno@acme.com", "voce@flow.app"]);
  });

  it("cria os dois workspaces", async () => {
    const workspaces = await prisma.workspace.findMany({ orderBy: { name: "asc" } });
    expect(workspaces.map((w) => w.name)).toEqual(["Acme Inc.", "Projetos pessoais"]);
  });

  it("dá três membros à Acme e um aos Projetos pessoais", async () => {
    const acme = await prisma.workspace.findFirstOrThrow({ where: { name: "Acme Inc." } });
    const pessoal = await prisma.workspace.findFirstOrThrow({
      where: { name: "Projetos pessoais" },
    });

    expect(await prisma.workspaceMember.count({ where: { workspaceId: acme.id } })).toBe(3);
    expect(await prisma.workspaceMember.count({ where: { workspaceId: pessoal.id } })).toBe(1);
  });

  it("cria as quatro etiquetas da Acme com as cores originais", async () => {
    const acme = await prisma.workspace.findFirstOrThrow({ where: { name: "Acme Inc." } });
    const labels = await prisma.label.findMany({
      where: { workspaceId: acme.id },
      orderBy: { name: "asc" },
    });

    expect(labels.map((l) => [l.name, l.color])).toEqual([
      ["design", "#ec4899"],
      ["jurídico", "#8b5cf6"],
      ["produto", "#10b981"],
      ["urgente", "#ef4444"],
    ]);
  });

  it("é idempotente", async () => {
    await seed();
    expect(await prisma.user.count()).toBe(3);
    expect(await prisma.workspace.count()).toBe(2);
  });

  it("cria as quatro tarefas", async () => {
    expect(await prisma.task.count()).toBe(4);
  });

  it("distribui as tarefas entre os dois workspaces", async () => {
    const acme = await prisma.workspace.findFirstOrThrow({ where: { name: "Acme Inc." } });
    const pessoal = await prisma.workspace.findFirstOrThrow({
      where: { name: "Projetos pessoais" },
    });

    expect(await prisma.task.count({ where: { workspaceId: acme.id } })).toBe(3);
    expect(await prisma.task.count({ where: { workspaceId: pessoal.id } })).toBe(1);
  });

  it("liga a tarefa do contrato às etiquetas jurídico e urgente, por id", async () => {
    const task = await prisma.task.findFirstOrThrow({
      where: { title: "Revisar proposta de contrato" },
      include: { labels: { include: { label: true } } },
    });

    expect(task.labels.map((l) => l.label.name).sort()).toEqual(["jurídico", "urgente"]);
  });

  it("registra o comentário da Ana com autor real", async () => {
    const comment = await prisma.comment.findFirstOrThrow({ include: { author: true } });

    expect(comment.author.name).toBe("Ana Souza");
    expect(comment.text).toBe("Enviei a última versão por email.");
  });

  it("cria as duas subtarefas na ordem original", async () => {
    const task = await prisma.task.findFirstOrThrow({
      where: { title: "Revisar proposta de contrato" },
      include: { subtasks: { orderBy: { position: "asc" } } },
    });

    expect(task.subtasks.map((s) => [s.title, s.done])).toEqual([
      ["Ler v3", true],
      ["Marcar reunião", false],
    ]);
  });

  it("cria a meta ligada ao Sprint 12", async () => {
    const goal = await prisma.goal.findFirstOrThrow({
      include: { sprints: { include: { sprint: true } } },
    });

    expect(goal.name).toBe("Release v1.2 pronta");
    expect(goal.sprints.map((s) => s.sprint.name)).toEqual(["Sprint 12"]);
  });

  it("cria a automação desligada", async () => {
    const automation = await prisma.automation.findFirstOrThrow();

    expect(automation.name).toBe("Ao concluir, remover do sprint");
    expect(automation.enabled).toBe(false);
    expect(automation.trigger).toEqual({ kind: "status_changed", to: "done" });
  });
});
