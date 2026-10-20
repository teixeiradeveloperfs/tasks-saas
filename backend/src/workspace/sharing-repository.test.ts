import { beforeEach, describe, expect, it } from "vitest";

import { NotFoundError } from "@/auth/authorization";
import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import { createRunbook } from "@/workspace/runbook-repository";
import {
  listItemShares,
  listSharedItems,
  revealSharedVaultEntry,
  revokeItemShare,
  shareItem,
} from "@/workspace/sharing-repository";
import { createVaultEntry } from "@/workspace/vault-repository";
import { seed } from "../../prisma/seed";

beforeEach(async () => resetDatabase());

describe("compartilhamento isolado de itens", () => {
  it("libera somente os itens escolhidos e revoga o acesso imediatamente", async () => {
    const { users, workspaces } = await seed();
    const recipient = await prisma.user.create({
      data: { name: "Convidado", email: "shared@example.com", avatarColor: "#0086f2" },
    });
    const outsider = await prisma.user.create({
      data: { name: "Sem acesso", email: "outsider@example.com", avatarColor: "#64748b" },
    });
    const runbook = await createRunbook(
      workspaces.acme.id,
      {
        title: "Reiniciar serviço",
        category: "Servidor",
        environment: "Ubuntu",
        tags: ["systemd"],
        variables: [],
        steps: [{ title: "Reiniciar", command: "sudo systemctl restart app", risk: "caution" }],
      },
      users.voce.id,
    );
    const vault = await createVaultEntry(
      workspaces.acme.id,
      { name: "Token deploy", category: "token", secret: "segredo-isolado" },
      users.voce.id,
    );

    const runbookShare = await shareItem(
      "runbook",
      runbook.runbook.id,
      recipient.email.toUpperCase(),
      users.voce.id,
    );
    const vaultShare = await shareItem("vault", vault.id, recipient.email, users.voce.id);
    expect(await listItemShares("runbook", runbook.runbook.id, users.voce.id)).toHaveLength(1);

    const shared = await listSharedItems(recipient.id);
    expect(shared.runbooks.map((item) => item.runbook.id)).toEqual([runbook.runbook.id]);
    expect(shared.vaultEntries.map((item) => item.id)).toEqual([vault.id]);
    expect(JSON.stringify(shared)).not.toContain("segredo-isolado");
    await expect(revealSharedVaultEntry(vault.id, recipient.id)).resolves.toMatchObject({
      secret: "segredo-isolado",
    });

    expect(await listSharedItems(outsider.id)).toEqual({ runbooks: [], vaultEntries: [] });
    await expect(revealSharedVaultEntry(vault.id, outsider.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    await revokeItemShare("runbook", runbook.runbook.id, runbookShare.id, users.voce.id);
    await revokeItemShare("vault", vault.id, vaultShare.id, users.voce.id);
    expect(await listSharedItems(recipient.id)).toEqual({ runbooks: [], vaultEntries: [] });
    await expect(revealSharedVaultEntry(vault.id, recipient.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("não deixa membro comum administrar compartilhamentos", async () => {
    const { users, workspaces } = await seed();
    const runbook = await createRunbook(
      workspaces.acme.id,
      {
        title: "Privado",
        category: "Servidor",
        environment: "Produção",
        tags: [],
        variables: [],
        steps: [{ title: "Ver", command: "uptime", risk: "safe" }],
      },
      users.voce.id,
    );

    await expect(
      shareItem("runbook", runbook.runbook.id, users.bruno.email, users.ana.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      listItemShares("runbook", runbook.runbook.id, users.ana.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
