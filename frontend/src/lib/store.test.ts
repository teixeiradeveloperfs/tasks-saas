import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Task, Workspace } from "@task-flow/shared/domain/models";

const api = vi.hoisted(() => ({ createTask: vi.fn(), deleteTask: vi.fn() }));
const workspaceApi = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  createRunbook: vi.fn(),
}));
const profileApi = vi.hoisted(() => ({ updateProfile: vi.fn() }));

vi.mock("@/lib/api/task", () => api);
vi.mock("@/lib/api/workspace", () => workspaceApi);
vi.mock("@/lib/api/profile", () => profileApi);

import { getDataRevision, useStore } from "@/state/workspace-store";

describe("hidratação do estado", () => {
  beforeEach(() => {
    api.createTask.mockReset();
    api.deleteTask.mockReset();
    workspaceApi.createWorkspace.mockReset();
    workspaceApi.updateWorkspace.mockReset();
    workspaceApi.createRunbook.mockReset();
    profileApi.updateProfile.mockReset();
  });

  it("não deixa uma leitura antiga apagar uma criação pendente", async () => {
    let finishWrite!: (task: Task) => void;
    api.createTask.mockReturnValue(new Promise<Task>((resolve) => (finishWrite = resolve)));

    useStore.getState().hydrateFromServer(
      {
        workspaces: [
          {
            id: "workspace-test",
            name: "Workspace de teste",
            color: "#0086f2",
            labels: [],
            members: [],
            sprints: [],
            customFields: [],
            docs: [],
            whiteboards: [],
            goals: [],
            automations: [],
            runbooks: [],
            createdAt: "2026-08-07T00:00:00.000Z",
          },
        ],
        tasks: [],
        profile: {
          id: "user-test",
          name: "Pessoa de teste",
          email: "teste@flow.app",
          role: "",
          avatarColor: "#0086f2",
          pinnedWorkspaces: [],
          pinnedTasks: [],
        },
        integrations: { "workspace-test": [] },
        taskPageInfo: { "workspace-test": { hasMore: false } },
      },
      getDataRevision(),
    );

    const workspaceId = useStore.getState().workspaces[0].id;
    const startedAtRevision = getDataRevision();
    const created = useStore.getState().createTask({
      workspaceId,
      title: "Criada durante a hidratação",
      status: "todo",
      priority: "medium",
      subtaskTitles: ["Preparar dados", "Validar resultado"],
    });

    expect(created.subtasks.map((subtask) => subtask.title)).toEqual([
      "Preparar dados",
      "Validar resultado",
    ]);

    useStore.getState().hydrateFromServer(
      {
        workspaces: [],
        tasks: [],
        profile: useStore.getState().profile!,
        integrations: {},
        taskPageInfo: {},
      },
      startedAtRevision,
    );

    expect(useStore.getState().tasks.some((task) => task.id === created.id)).toBe(true);

    finishWrite({ ...created, id: "saved-task" });
    await vi.waitFor(() =>
      expect(useStore.getState().tasks.some((task) => task.id === "saved-task")).toBe(true),
    );
  });

  it("cria tarefas no projeto ativo do workspace", async () => {
    const workspace: Workspace = {
      id: "workspace-project",
      name: "Workspace com projetos",
      color: "#0086f2",
      projects: [
        {
          id: "project-one",
          workspaceId: "workspace-project",
          name: "Projeto um",
          color: "#0086f2",
          createdAt: "2026-08-08T00:00:00.000Z",
        },
        {
          id: "project-two",
          workspaceId: "workspace-project",
          name: "Projeto dois",
          color: "#22c55e",
          createdAt: "2026-08-08T00:00:01.000Z",
        },
      ],
      labels: [],
      members: [],
      sprints: [],
      customFields: [],
      docs: [],
      whiteboards: [],
      goals: [],
      automations: [],
      runbooks: [],
      createdAt: "2026-08-08T00:00:00.000Z",
    };
    useStore.setState({
      workspaces: [workspace],
      tasks: [],
      activeProjectIds: { [workspace.id]: "project-two" },
      profile: {
        id: "user-test",
        name: "Pessoa de teste",
        email: "teste@flow.app",
        role: "",
        avatarColor: "#0086f2",
        pinnedWorkspaces: [],
        pinnedTasks: [],
      },
    });
    api.createTask.mockImplementation(async ({ data }: { data: Task }) => ({
      ...data,
      id: "saved-project-task",
      labels: [],
      comments: [],
      subtasks: [],
      timeEntries: [],
      customFields: {},
      activity: [],
      blockedBy: [],
      attachments: [],
      position: 0,
      createdAt: "2026-08-08T00:00:00.000Z",
    }));

    useStore.getState().createTask({
      workspaceId: workspace.id,
      title: "Tarefa do projeto dois",
      status: "todo",
      priority: "medium",
    });

    await vi.waitFor(() => expect(api.createTask).toHaveBeenCalled());
    expect(api.createTask.mock.calls[0][0].data.projectId).toBe("project-two");
  });

  it("só publica e navega com o id definitivo do workspace", async () => {
    let finishWrite!: (workspace: Workspace) => void;
    workspaceApi.createWorkspace.mockReturnValue(
      new Promise((resolve) => {
        finishWrite = resolve;
      }),
    );

    const creation = useStore.getState().createWorkspace({
      name: "Workspace real",
      color: "#0086f2",
      description: "Persistido no servidor",
    });

    expect(
      useStore.getState().workspaces.some((workspace) => workspace.name === "Workspace real"),
    ).toBe(false);

    finishWrite({
      id: "workspace-from-database",
      name: "Workspace real",
      color: "#0086f2",
      description: "Persistido no servidor",
      labels: [],
      members: [
        {
          id: "user-test",
          name: "Pessoa de teste",
          color: "#0086f2",
          role: "Owner",
          permission: "OWNER",
        },
      ],
      sprints: [],
      customFields: [],
      docs: [],
      whiteboards: [],
      goals: [],
      automations: [],
      runbooks: [],
      createdAt: "2026-08-08T00:00:00.000Z",
    });

    await expect(creation).resolves.toMatchObject({ id: "workspace-from-database" });
    expect(useStore.getState().workspaces.at(-1)?.id).toBe("workspace-from-database");
  });

  it("cria runbooks no projeto ativo e reconcilia a resposta persistida", async () => {
    const workspace: Workspace = {
      id: "workspace-runbook",
      name: "Infra",
      color: "#0086f2",
      projects: [
        {
          id: "project-infra",
          workspaceId: "workspace-runbook",
          name: "Infraestrutura",
          color: "#0086f2",
          createdAt: "2026-08-08T00:00:00.000Z",
        },
      ],
      labels: [],
      members: [],
      sprints: [],
      customFields: [],
      docs: [],
      whiteboards: [],
      goals: [],
      automations: [],
      runbooks: [],
      createdAt: "2026-08-08T00:00:00.000Z",
    };
    const runbook = {
      id: "runbook-saved",
      workspaceId: workspace.id,
      projectId: "project-infra",
      title: "Logs do banco",
      category: "Banco",
      environment: "Ubuntu",
      tags: ["logs"],
      favorite: false,
      steps: [
        {
          id: "step-saved",
          title: "Ver logs",
          command: "journalctl -u postgresql -f",
          risk: "safe" as const,
          position: 0,
          checked: false,
        },
      ],
      variables: [],
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
    };
    workspaceApi.createRunbook.mockResolvedValue({
      runbook,
      workspace: { ...workspace, runbooks: [runbook] },
    });
    useStore.setState({
      workspaces: [workspace],
      activeProjectIds: { [workspace.id]: "project-infra" },
    });

    const saved = await useStore.getState().createRunbook(workspace.id, {
      title: runbook.title,
      category: runbook.category,
      environment: runbook.environment,
      tags: runbook.tags,
      steps: runbook.steps.map(({ title, command, risk }) => ({ title, command, risk })),
      variables: [],
    });

    expect(workspaceApi.createRunbook.mock.calls[0][0].data.projectId).toBe("project-infra");
    expect(saved?.id).toBe(runbook.id);
    expect(useStore.getState().workspaces[0].runbooks).toContainEqual(runbook);
  });

  it("só remove a tarefa da tela depois que o servidor confirma a exclusão", async () => {
    let confirmDelete!: () => void;
    api.deleteTask.mockReturnValue(
      new Promise<void>((resolve) => {
        confirmDelete = resolve;
      }),
    );
    const task: Task = {
      id: "task-to-delete",
      workspaceId: "workspace-test",
      title: "Excluir depois da confirmação",
      status: "todo",
      priority: "medium",
      labels: [],
      comments: [],
      subtasks: [],
      timeEntries: [],
      customFields: {},
      activity: [],
      blockedBy: [],
      attachments: [],
      position: 0,
      createdAt: "2026-08-08T00:00:00.000Z",
    };
    useStore.setState({
      tasks: [task],
      profile: {
        id: "user-test",
        name: "Pessoa de teste",
        email: "teste@flow.app",
        role: "",
        avatarColor: "#0086f2",
        pinnedWorkspaces: [],
        pinnedTasks: [task.id],
      },
    });

    const deletion = useStore.getState().deleteTask(task.id);
    expect(useStore.getState().tasks).toContainEqual(task);

    confirmDelete();
    await expect(deletion).resolves.toBe(true);
    expect(useStore.getState().tasks).toEqual([]);
    expect(useStore.getState().profile?.pinnedTasks).toEqual([]);
  });

  it("atualiza nome e foto somente depois da confirmação do servidor", async () => {
    const original: Workspace = {
      id: "workspace-edit",
      name: "Nome antigo",
      color: "#0086f2",
      labels: [],
      members: [],
      sprints: [],
      customFields: [],
      docs: [],
      whiteboards: [],
      goals: [],
      automations: [],
      runbooks: [],
      createdAt: "2026-08-08T00:00:00.000Z",
    };
    const saved = {
      ...original,
      name: "Nome novo",
      imageUrl: "data:image/jpeg;base64,YWJj",
    };
    workspaceApi.updateWorkspace.mockResolvedValue(saved);
    useStore.setState({ workspaces: [original] });

    await useStore
      .getState()
      .updateWorkspace(original.id, { name: saved.name, imageUrl: saved.imageUrl });

    expect(workspaceApi.updateWorkspace).toHaveBeenCalledWith({
      data: {
        id: original.id,
        patch: {
          name: saved.name,
          color: undefined,
          description: undefined,
          imageUrl: saved.imageUrl,
        },
      },
    });
    expect(useStore.getState().workspaces[0]).toEqual(saved);
  });

  it("confirma e-mail e foto do perfil com a resposta do servidor", async () => {
    const current = {
      id: "profile-edit",
      name: "Pessoa",
      email: "antigo@example.com",
      role: "",
      avatarColor: "#0086f2",
      pinnedWorkspaces: [],
      pinnedTasks: [],
    };
    useStore.setState({ profile: current });
    const saved = {
      ...current,
      email: "novo@example.com",
      avatarUrl: "data:image/jpeg;base64,YWJj",
    };
    profileApi.updateProfile.mockResolvedValue(saved);

    await useStore.getState().updateProfile({ email: saved.email, avatarUrl: saved.avatarUrl });

    expect(useStore.getState().profile).toEqual(saved);
  });
});
