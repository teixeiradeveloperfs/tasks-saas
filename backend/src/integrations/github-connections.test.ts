import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import { seed } from "../../prisma/seed";

beforeEach(async () => {
  await resetDatabase();
});

describe("instalações GitHub por workspace", () => {
  it("preserva conta pessoal e organizações sem substituir conexões existentes", async () => {
    const { users, workspaces } = await seed();
    const base = {
      workspaceId: workspaces.acme.id,
      connectedById: users.voce.id,
    };

    await prisma.gitHubConnection.createMany({
      data: [
        {
          ...base,
          installationId: "personal-installation",
          accountLogin: "miguel",
          accountType: "User",
        },
        {
          ...base,
          installationId: "org-installation",
          accountLogin: "automa-group",
          accountType: "Organization",
        },
      ],
    });

    const connections = await prisma.gitHubConnection.findMany({
      where: { workspaceId: workspaces.acme.id },
      orderBy: { accountLogin: "asc" },
    });
    expect(connections.map((connection) => connection.accountLogin)).toEqual([
      "automa-group",
      "miguel",
    ]);
  });

  it("permite reutilizar uma instalação em outro workspace", async () => {
    const { users, workspaces } = await seed();
    await prisma.gitHubConnection.createMany({
      data: [
        {
          workspaceId: workspaces.acme.id,
          connectedById: users.voce.id,
          installationId: "shared-installation",
          accountLogin: "miguel",
          accountType: "User",
        },
        {
          workspaceId: workspaces.pessoal.id,
          connectedById: users.voce.id,
          installationId: "shared-installation",
          accountLogin: "miguel",
          accountType: "User",
        },
      ],
    });

    expect(
      await prisma.gitHubConnection.count({
        where: { installationId: "shared-installation" },
      }),
    ).toBe(2);
  });
});
