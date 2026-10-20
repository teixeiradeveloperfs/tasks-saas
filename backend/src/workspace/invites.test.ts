import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import { NotFoundError } from "@/auth/authorization";
import {
  acceptWorkspaceInvite,
  acceptWorkspaceInviteAsUser,
  createWorkspaceInvite,
  getInvite,
} from "@/workspace/invites";
import { seed } from "../../prisma/seed";

describe("convites de workspace", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("cria um link, aceita uma vez e cria a membresia com senha", async () => {
    const { users, workspaces } = await seed();
    const invite = await createWorkspaceInvite({
      workspaceId: workspaces.acme.id,
      invitedById: users.voce.id,
      email: "carla@example.com",
    });

    expect(invite.path).toBe(`/invite/${invite.token}`);
    expect(await getInvite(invite.token)).toMatchObject({
      email: "carla@example.com",
      hasAccount: false,
    });
    const accepted = await acceptWorkspaceInvite({
      token: invite.token,
      name: "Carla Lima",
      role: "Design",
      password: "senha-segura-com-12",
    });

    expect(accepted.workspaceId).toBe(workspaces.acme.id);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "carla@example.com" } });
    expect(user.passwordHash).toBeTruthy();
    expect(
      await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: workspaces.acme.id, userId: user.id } },
      }),
    ).toMatchObject({ title: "Design" });

    await expect(
      acceptWorkspaceInvite({
        token: invite.token,
        name: "Carla Lima",
        password: "senha-segura-com-12",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("não altera o perfil global quando uma conta existente aceita outro workspace", async () => {
    const { users, workspaces } = await seed();
    const invite = await createWorkspaceInvite({
      workspaceId: workspaces.pessoal.id,
      invitedById: users.voce.id,
      email: "ana@acme.com",
    });

    expect(await getInvite(invite.token, users.ana.id)).toMatchObject({
      hasAccount: true,
      authenticated: true,
      authenticatedAsInvitee: true,
    });
    await expect(
      acceptWorkspaceInvite({
        token: invite.token,
        role: "Convidada",
        password: "senha-qualquer-com-12",
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "invite_login_required" });

    await acceptWorkspaceInviteAsUser({
      token: invite.token,
      userId: users.ana.id,
      role: "Convidada",
    });

    expect(await prisma.user.findUniqueOrThrow({ where: { id: users.ana.id } })).toMatchObject({
      name: "Ana Souza",
      email: "ana@acme.com",
    });
  });

  it("não cria convite para quem já pertence ao workspace", async () => {
    const { users, workspaces } = await seed();

    await expect(
      createWorkspaceInvite({
        workspaceId: workspaces.acme.id,
        invitedById: users.voce.id,
        email: "ana@acme.com",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("mantém o link anterior válido até um dos convites ser aceito", async () => {
    const { users, workspaces } = await seed();
    const input = {
      workspaceId: workspaces.acme.id,
      invitedById: users.voce.id,
      email: "thiago@example.com",
    };
    const first = await createWorkspaceInvite(input);
    const second = await createWorkspaceInvite(input);

    expect(await getInvite(first.token)).toMatchObject({ email: input.email });
    expect(await getInvite(second.token)).toMatchObject({ email: input.email });

    await acceptWorkspaceInvite({
      token: first.token,
      name: "Thiago",
      password: "senha-segura-com-12",
    });

    expect(await getInvite(first.token)).toBeNull();
    expect(await getInvite(second.token)).toBeNull();
  });
});
