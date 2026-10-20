import { randomUUID } from "node:crypto";
import type {
  VaultEntryInput,
  VaultEntrySummary,
  VaultEntryUpdateInput,
} from "@task-flow/shared/domain/security-contracts";

import { assertWorkspaceAdmin, NotFoundError } from "@/auth/authorization";
import { prisma } from "@/db/client";
import { recordAudit } from "@/workspace/audit-repository";
import { decryptValue, encryptValue, encryptionKey } from "@/security/encryption";

type VaultRecord = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  username: string | null;
  url: string | null;
  category: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { name: string };
  updatedBy: { name: string };
};

const people = {
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} as const;

function mapEntry(entry: VaultRecord): VaultEntrySummary {
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    name: entry.name,
    description: entry.description ?? undefined,
    username: entry.username ?? undefined,
    url: entry.url ?? undefined,
    category: entry.category as VaultEntrySummary["category"],
    createdBy: entry.createdBy.name,
    updatedBy: entry.updatedBy.name,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function aad(workspaceId: string, entryId: string) {
  return `automa-tasks:vault:${workspaceId}:${entryId}`;
}

export async function listVaultEntries(workspaceId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await assertWorkspaceAdmin(tx, userId, workspaceId);
    const entries = await tx.vaultEntry.findMany({
      where: { workspaceId },
      include: people,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    return entries.map(mapEntry);
  });
}

export async function createVaultEntry(
  workspaceId: string,
  input: VaultEntryInput,
  userId: string,
) {
  const id = randomUUID();
  const encrypted = encryptValue(input.secret, encryptionKey("vault"), aad(workspaceId, id));
  return prisma.$transaction(async (tx) => {
    await assertWorkspaceAdmin(tx, userId, workspaceId);
    const entry = await tx.vaultEntry.create({
      data: {
        id,
        workspaceId,
        name: input.name,
        description: input.description || null,
        username: input.username || null,
        url: input.url || null,
        category: input.category,
        ...encrypted,
        createdById: userId,
        updatedById: userId,
      },
      include: people,
    });
    await recordAudit(tx, {
      workspaceId,
      actorId: userId,
      action: "vault.created",
      entityType: "vault_entry",
      entityId: id,
      summary: "Item criado no vault.",
    });
    return mapEntry(entry);
  });
}

export async function updateVaultEntry(id: string, input: VaultEntryUpdateInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.vaultEntry.findUnique({ where: { id } });
    if (!current) throw new NotFoundError();
    await assertWorkspaceAdmin(tx, userId, current.workspaceId);
    const encrypted =
      input.secret === undefined
        ? {}
        : encryptValue(input.secret, encryptionKey("vault"), aad(current.workspaceId, id));
    const entry = await tx.vaultEntry.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description || null }),
        ...(input.username === undefined ? {} : { username: input.username || null }),
        ...(input.url === undefined ? {} : { url: input.url || null }),
        ...(input.category === undefined ? {} : { category: input.category }),
        ...encrypted,
        updatedById: userId,
      },
      include: people,
    });
    await recordAudit(tx, {
      workspaceId: current.workspaceId,
      actorId: userId,
      action: "vault.updated",
      entityType: "vault_entry",
      entityId: id,
      summary: "Item atualizado no vault.",
    });
    return mapEntry(entry);
  });
}

export async function revealVaultEntry(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.vaultEntry.findUnique({ where: { id }, include: people });
    if (!entry) throw new NotFoundError();
    await assertWorkspaceAdmin(tx, userId, entry.workspaceId);
    const secret = decryptValue(
      { ciphertext: entry.ciphertext, iv: entry.iv, authTag: entry.authTag },
      encryptionKey("vault"),
      aad(entry.workspaceId, entry.id),
    );
    await recordAudit(tx, {
      workspaceId: entry.workspaceId,
      actorId: userId,
      action: "vault.revealed",
      entityType: "vault_entry",
      entityId: id,
      summary: "Um item do vault foi revelado.",
    });
    return { ...mapEntry(entry), secret };
  });
}

export async function deleteVaultEntry(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.vaultEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundError();
    await assertWorkspaceAdmin(tx, userId, entry.workspaceId);
    await recordAudit(tx, {
      workspaceId: entry.workspaceId,
      actorId: userId,
      action: "vault.deleted",
      entityType: "vault_entry",
      entityId: id,
      summary: "Item removido do vault.",
    });
    await tx.vaultEntry.delete({ where: { id } });
    return { workspaceId: entry.workspaceId };
  });
}
