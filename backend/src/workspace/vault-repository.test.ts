import { beforeEach, describe, expect, it } from "vitest";

import { NotFoundError } from "@/auth/authorization";
import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";
import { createVaultEntry, listVaultEntries, revealVaultEntry } from "@/workspace/vault-repository";
import { seed } from "../../prisma/seed";

beforeEach(async () => resetDatabase());

describe("vault", () => {
  it("criptografa o valor, não o lista e audita a revelação sem expor o segredo", async () => {
    const { users, workspaces } = await seed();
    const workspaceId = workspaces.acme.id;
    const input = {
      name: "Token produção",
      category: "token" as const,
      secret: "ghp_super-secreto",
    };
    const created = await createVaultEntry(workspaceId, input, users.voce.id);
    expect(created).not.toHaveProperty("secret");
    const stored = await prisma.vaultEntry.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.ciphertext).not.toContain(input.secret);
    expect(await listVaultEntries(workspaceId, users.voce.id)).not.toContainEqual(
      expect.objectContaining({ secret: input.secret }),
    );
    await expect(revealVaultEntry(created.id, users.voce.id)).resolves.toMatchObject({
      secret: input.secret,
    });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: created.id, action: "vault.revealed" },
    });
    expect(JSON.stringify(audit)).not.toContain(input.secret);
  });

  it("não permite que membro comum liste nem revele itens", async () => {
    const { users, workspaces } = await seed();
    const workspaceId = workspaces.acme.id;
    const created = await createVaultEntry(
      workspaceId,
      { name: "Senha", category: "credential", secret: "não-vazar" },
      users.voce.id,
    );
    await expect(listVaultEntries(workspaceId, users.ana.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(revealVaultEntry(created.id, users.ana.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
