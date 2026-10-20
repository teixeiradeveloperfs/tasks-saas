import { prisma } from "@/db/client";
import { documentContentAad, encryptContentText } from "@/security/content-encryption";

const ISO_BASE = new Date("2025-01-01T00:00:00.000Z");
const ACME_WORKSPACE_ID = "seed-workspace-acme";
const ACME_PROJECT_ID = "seed-project-acme";
const PERSONAL_PROJECT_ID = "seed-project-personal";
const ACME_DOC_ID = "seed-doc-acme";

export async function seed() {
  // Idempotente: apagar os workspaces leva junto tudo que depende deles por cascata,
  // e apagar os usuários limpa o resto.
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  const voce = await prisma.user.create({
    data: {
      name: "Você",
      email: "voce@flow.app",
      avatarColor: "#0086f2",
      title: "Product Manager",
    },
  });

  const ana = await prisma.user.create({
    data: { name: "Ana Souza", email: "ana@acme.com", avatarColor: "#ec4899" },
  });

  const bruno = await prisma.user.create({
    data: { name: "Bruno Lima", email: "bruno@acme.com", avatarColor: "#10b981" },
  });

  const acme = await prisma.workspace.create({
    data: {
      id: ACME_WORKSPACE_ID,
      name: "Acme Inc.",
      color: "#0086f2",
      description: "Cliente principal — produto B2B",
      createdAt: ISO_BASE,
      members: {
        create: [
          { userId: voce.id, title: "Owner", permission: "OWNER" },
          { userId: ana.id, title: "Design", permission: "MEMBER" },
          { userId: bruno.id, title: "Dev", permission: "MEMBER" },
        ],
      },
      projects: {
        create: [
          {
            id: ACME_PROJECT_ID,
            name: "Projeto padrão",
            color: "#0086f2",
            createdAt: ISO_BASE,
            boardColumns: {
              create: [
                {
                  id: "seed-column-acme-todo",
                  name: "A fazer",
                  status: "todo",
                  color: "#94a3b8",
                  position: 0,
                },
                {
                  id: "seed-column-acme-progress",
                  name: "Em progresso",
                  status: "in_progress",
                  color: "#0086f2",
                  position: 1,
                },
                {
                  id: "seed-column-acme-done",
                  name: "Concluído",
                  status: "done",
                  color: "#22c55e",
                  position: 2,
                },
              ],
            },
          },
        ],
      },
      labels: {
        create: [
          { name: "jurídico", color: "#8b5cf6" },
          { name: "urgente", color: "#ef4444" },
          { name: "design", color: "#ec4899" },
          { name: "produto", color: "#10b981" },
        ],
      },
      sprints: {
        create: [
          {
            projectId: ACME_PROJECT_ID,
            name: "Sprint 12",
            goal: "Fechar release v1.2 e alinhar contrato",
            status: "active",
            createdAt: ISO_BASE,
          },
        ],
      },
      customFields: {
        create: [
          { name: "Story points", type: "number", options: [] },
          { name: "Área", type: "select", options: ["Produto", "Design", "Jurídico"] },
        ],
      },
      docs: {
        create: [
          {
            id: ACME_DOC_ID,
            projectId: ACME_PROJECT_ID,
            title: "Onboarding Acme",
            body: encryptContentText(
              "# Contexto\n\nCliente B2B, contrato anual.\n\n## Contatos\n- Ana (Design)\n- Bruno (Dev)\n\n## Links\n- Repositório interno",
              documentContentAad(ACME_WORKSPACE_ID, ACME_DOC_ID),
            ),
            createdAt: ISO_BASE,
          },
        ],
      },
    },
  });

  const sprint12 = await prisma.sprint.findFirstOrThrow({
    where: { workspaceId: acme.id, name: "Sprint 12" },
  });

  await prisma.goal.create({
    data: {
      workspaceId: acme.id,
      projectId: ACME_PROJECT_ID,
      name: "Release v1.2 pronta",
      description: "Fechar todas as tarefas do Sprint 12 e publicar release.",
      createdAt: ISO_BASE,
      sprints: { create: [{ sprintId: sprint12.id }] },
    },
  });

  await prisma.automation.create({
    data: {
      workspaceId: acme.id,
      name: "Ao concluir, remover do sprint",
      enabled: false,
      trigger: { kind: "status_changed", to: "done" },
      action: { kind: "set_sprint", sprintId: "" },
      createdAt: ISO_BASE,
    },
  });

  const pessoal = await prisma.workspace.create({
    data: {
      name: "Projetos pessoais",
      color: "#0ea5e9",
      description: "Ideias e side-projects",
      createdAt: ISO_BASE,
      members: { create: [{ userId: voce.id, title: "Owner", permission: "OWNER" }] },
      projects: {
        create: [
          {
            id: PERSONAL_PROJECT_ID,
            name: "Projeto padrão",
            color: "#0ea5e9",
            createdAt: ISO_BASE,
            boardColumns: {
              create: [
                {
                  id: "seed-column-personal-todo",
                  name: "A fazer",
                  status: "todo",
                  color: "#94a3b8",
                  position: 0,
                },
                {
                  id: "seed-column-personal-progress",
                  name: "Em progresso",
                  status: "in_progress",
                  color: "#0086f2",
                  position: 1,
                },
                {
                  id: "seed-column-personal-done",
                  name: "Concluído",
                  status: "done",
                  color: "#22c55e",
                  position: 2,
                },
              ],
            },
          },
        ],
      },
      labels: { create: [{ name: "escrita", color: "#f59e0b" }] },
    },
  });

  // As datas do seed são relativas a esta âncora, como no estado antigo.
  const SEED_ANCHOR = new Date("2025-07-11T12:00:00.000Z");
  const inSeedDays = (n: number) => {
    const d = new Date(SEED_ANCHOR);
    d.setDate(d.getDate() + n);
    return d;
  };

  const acmeLabels = await prisma.label.findMany({ where: { workspaceId: acme.id } });
  const labelId = (name: string) => {
    const found = acmeLabels.find((l) => l.name === name);
    if (!found) throw new Error(`Etiqueta "${name}" não encontrada no seed da Acme.`);
    return found.id;
  };

  await prisma.task.create({
    data: {
      workspaceId: acme.id,
      projectId: ACME_PROJECT_ID,
      boardColumnId: "seed-column-acme-todo",
      title: "Revisar proposta de contrato",
      description: "Alinhar cláusulas com o jurídico antes de sexta.",
      status: "todo",
      priority: "high",
      assigneeId: voce.id,
      assignees: { create: [{ userId: voce.id }, { userId: ana.id }] },
      sprintId: sprint12.id,
      startDate: inSeedDays(0),
      dueDate: inSeedDays(2),
      estimateMinutes: 45,
      createdAt: ISO_BASE,
      labels: {
        create: [{ labelId: labelId("jurídico") }, { labelId: labelId("urgente") }],
      },
      comments: {
        create: [
          {
            authorId: ana.id,
            text: "Enviei a última versão por email.",
            createdAt: new Date("2025-07-10T12:00:00.000Z"),
          },
        ],
      },
      subtasks: {
        create: [
          { title: "Ler v3", done: true, position: 0 },
          { title: "Marcar reunião", done: false, position: 1 },
        ],
      },
      activities: {
        create: [
          { authorId: voce.id, kind: "created", text: "criou a tarefa", createdAt: ISO_BASE },
        ],
      },
    },
  });

  await prisma.task.create({
    data: {
      workspaceId: acme.id,
      projectId: ACME_PROJECT_ID,
      boardColumnId: "seed-column-acme-progress",
      title: "Kickoff com time de design",
      status: "in_progress",
      priority: "medium",
      assigneeId: ana.id,
      assignees: { create: [{ userId: ana.id }, { userId: bruno.id }] },
      sprintId: sprint12.id,
      dueDate: inSeedDays(0),
      createdAt: ISO_BASE,
      labels: { create: [{ labelId: labelId("design") }] },
      activities: {
        create: [
          { authorId: voce.id, kind: "created", text: "criou a tarefa", createdAt: ISO_BASE },
        ],
      },
    },
  });

  await prisma.task.create({
    data: {
      workspaceId: acme.id,
      projectId: ACME_PROJECT_ID,
      boardColumnId: "seed-column-acme-done",
      title: "Publicar release notes v1.2",
      status: "done",
      priority: "low",
      assigneeId: bruno.id,
      assignees: { create: [{ userId: bruno.id }] },
      sprintId: sprint12.id,
      dueDate: inSeedDays(-3),
      estimateMinutes: 60,
      createdAt: ISO_BASE,
      labels: { create: [{ labelId: labelId("produto") }] },
      activities: {
        create: [
          { authorId: voce.id, kind: "created", text: "criou a tarefa", createdAt: ISO_BASE },
        ],
      },
    },
  });

  const escrita = await prisma.label.findFirstOrThrow({
    where: { workspaceId: pessoal.id, name: "escrita" },
  });

  await prisma.task.create({
    data: {
      workspaceId: pessoal.id,
      projectId: PERSONAL_PROJECT_ID,
      boardColumnId: "seed-column-personal-todo",
      title: "Rascunhar post sobre kanban",
      status: "todo",
      priority: "low",
      assigneeId: voce.id,
      assignees: { create: [{ userId: voce.id }] },
      dueDate: inSeedDays(5),
      createdAt: ISO_BASE,
      labels: { create: [{ labelId: escrita.id }] },
      activities: {
        create: [
          { authorId: voce.id, kind: "created", text: "criou a tarefa", createdAt: ISO_BASE },
        ],
      },
    },
  });

  // Os dados de exemplo representam workspaces já em uso, onde todo mundo enxerga
  // todo projeto — o mesmo estado que a migration de acesso por projeto preserva
  // para quem já era membro. Restringir aqui faria o seed nascer diferente de
  // qualquer instalação real.
  const projects = await prisma.project.findMany({ select: { id: true, workspaceId: true } });
  const members = await prisma.workspaceMember.findMany({
    select: { workspaceId: true, userId: true },
  });
  await prisma.projectMember.createMany({
    data: projects.flatMap((project) =>
      members
        .filter((member) => member.workspaceId === project.workspaceId)
        .map((member) => ({ projectId: project.id, userId: member.userId })),
    ),
    skipDuplicates: true,
  });

  return { users: { voce, ana, bruno }, workspaces: { acme, pessoal } };
}

// Executado por `prisma db seed` via `tsx prisma/seed.ts`. A comparação com
// process.argv[1] garante que importar este módulo num teste não dispare o seed.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  await seed();
  console.log("Seed aplicado.");
  await prisma.$disconnect();
}
