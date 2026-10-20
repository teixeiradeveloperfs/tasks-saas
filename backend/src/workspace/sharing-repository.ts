import type {
  ItemShare,
  SharedItems,
  SharedRunbook,
  SharedVaultEntry,
} from "@task-flow/shared/domain/security-contracts";

import { assertWorkspaceAdmin, NotFoundError } from "@/auth/authorization";
import { prisma } from "@/db/client";
import { decryptValue, encryptionKey } from "@/security/encryption";
import { recordAudit } from "@/workspace/audit-repository";

type ShareKind = "runbook" | "vault";
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

class ShareError extends Error {
  statusCode = 400;
}

const recipientSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
} as const;

function mapShare(share: {
  id: string;
  createdAt: Date;
  sharedWith: { id: string; name: string; email: string; avatarUrl: string | null };
}): ItemShare {
  return {
    id: share.id,
    user: { ...share.sharedWith, avatarUrl: share.sharedWith.avatarUrl ?? undefined },
    sharedAt: share.createdAt.toISOString(),
  };
}

async function itemWorkspace(tx: Tx, kind: ShareKind, itemId: string) {
  const item =
    kind === "runbook"
      ? await tx.runbook.findUnique({ where: { id: itemId }, select: { workspaceId: true } })
      : await tx.vaultEntry.findUnique({ where: { id: itemId }, select: { workspaceId: true } });
  if (!item) throw new NotFoundError();
  return item.workspaceId;
}

export async function listItemShares(kind: ShareKind, itemId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const workspaceId = await itemWorkspace(tx, kind, itemId);
    await assertWorkspaceAdmin(tx, actorId, workspaceId);
    const shares =
      kind === "runbook"
        ? await tx.runbookShare.findMany({
            where: { runbookId: itemId },
            include: { sharedWith: { select: recipientSelect } },
            orderBy: { createdAt: "desc" },
          })
        : await tx.vaultEntryShare.findMany({
            where: { vaultEntryId: itemId },
            include: { sharedWith: { select: recipientSelect } },
            orderBy: { createdAt: "desc" },
          });
    return shares.map(mapShare);
  });
}

export async function shareItem(kind: ShareKind, itemId: string, email: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const workspaceId = await itemWorkspace(tx, kind, itemId);
    await assertWorkspaceAdmin(tx, actorId, workspaceId);
    const recipient = await tx.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: recipientSelect,
    });
    if (!recipient) throw new ShareError("Nenhum usuário cadastrado com este e-mail.");
    if (recipient.id === actorId) throw new ShareError("Você já tem acesso a este item.");

    const share =
      kind === "runbook"
        ? await tx.runbookShare.upsert({
            where: { runbookId_sharedWithId: { runbookId: itemId, sharedWithId: recipient.id } },
            create: { runbookId: itemId, sharedWithId: recipient.id, sharedById: actorId },
            update: {},
            include: { sharedWith: { select: recipientSelect } },
          })
        : await tx.vaultEntryShare.upsert({
            where: {
              vaultEntryId_sharedWithId: { vaultEntryId: itemId, sharedWithId: recipient.id },
            },
            create: { vaultEntryId: itemId, sharedWithId: recipient.id, sharedById: actorId },
            update: {},
            include: { sharedWith: { select: recipientSelect } },
          });
    await recordAudit(tx, {
      workspaceId,
      actorId,
      action: `${kind}.shared`,
      entityType: kind === "runbook" ? "runbook" : "vault_entry",
      entityId: itemId,
      summary: `${kind === "runbook" ? "Runbook" : "Item do vault"} compartilhado com um usuário.`,
    });
    return mapShare(share);
  });
}

export async function revokeItemShare(
  kind: ShareKind,
  itemId: string,
  shareId: string,
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const workspaceId = await itemWorkspace(tx, kind, itemId);
    await assertWorkspaceAdmin(tx, actorId, workspaceId);
    const share =
      kind === "runbook"
        ? await tx.runbookShare.findFirst({ where: { id: shareId, runbookId: itemId } })
        : await tx.vaultEntryShare.findFirst({ where: { id: shareId, vaultEntryId: itemId } });
    if (!share) throw new NotFoundError();
    if (kind === "runbook") await tx.runbookShare.delete({ where: { id: shareId } });
    else await tx.vaultEntryShare.delete({ where: { id: shareId } });
    await recordAudit(tx, {
      workspaceId,
      actorId,
      action: `${kind}.share_revoked`,
      entityType: kind === "runbook" ? "runbook" : "vault_entry",
      entityId: itemId,
      summary: `Acesso compartilhado a ${kind === "runbook" ? "um runbook" : "um item do vault"} revogado.`,
    });
  });
}

function mapRunbook(record: {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string | null;
  category: string;
  environment: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  steps: Array<{
    id: string;
    title: string;
    command: string;
    explanation: string | null;
    expectedResult: string | null;
    risk: "safe" | "caution" | "dangerous";
    position: number;
    checked: boolean;
  }>;
  variables: Array<{
    id: string;
    key: string;
    defaultValue: string | null;
    description: string | null;
    position: number;
  }>;
}): SharedRunbook["runbook"] {
  return {
    id: record.id,
    title: record.title,
    description: record.description ?? undefined,
    category: record.category,
    environment: record.environment,
    tags: record.tags,
    steps: record.steps.map((step) => ({
      ...step,
      explanation: step.explanation ?? undefined,
      expectedResult: step.expectedResult ?? undefined,
    })),
    variables: record.variables.map((variable) => ({
      ...variable,
      defaultValue: variable.defaultValue ?? undefined,
      description: variable.description ?? undefined,
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

type SharedVaultRecord = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  username: string | null;
  url: string | null;
  category: string;
  createdAt: Date;
  updatedAt: Date;
  workspace: { name: string };
  createdBy: { name: string };
  updatedBy: { name: string };
};

function mapSharedVault(
  entry: SharedVaultRecord,
  share: { id: string; createdAt: Date; sharedBy: { name: string } },
): SharedVaultEntry {
  return {
    shareId: share.id,
    sharedAt: share.createdAt.toISOString(),
    sharedBy: share.sharedBy.name,
    workspaceName: entry.workspace.name,
    id: entry.id,
    name: entry.name,
    description: entry.description ?? undefined,
    username: entry.username ?? undefined,
    url: entry.url ?? undefined,
    category: entry.category as SharedVaultEntry["category"],
    createdBy: entry.createdBy.name,
    updatedBy: entry.updatedBy.name,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export async function listSharedItems(userId: string): Promise<SharedItems> {
  const [runbookShares, vaultShares] = await Promise.all([
    prisma.runbookShare.findMany({
      where: { sharedWithId: userId },
      include: {
        sharedBy: { select: { name: true } },
        runbook: {
          include: {
            workspace: { select: { name: true } },
            steps: { orderBy: { position: "asc" } },
            variables: { orderBy: { position: "asc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.vaultEntryShare.findMany({
      where: { sharedWithId: userId },
      include: {
        sharedBy: { select: { name: true } },
        vaultEntry: {
          include: {
            workspace: { select: { name: true } },
            createdBy: { select: { name: true } },
            updatedBy: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    runbooks: runbookShares.map((share): SharedRunbook => ({
      shareId: share.id,
      sharedAt: share.createdAt.toISOString(),
      sharedBy: share.sharedBy.name,
      workspace: share.runbook.workspace,
      runbook: mapRunbook(share.runbook),
    })),
    vaultEntries: vaultShares.map((share) => mapSharedVault(share.vaultEntry, share)),
  };
}

export async function revealSharedVaultEntry(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const share = await tx.vaultEntryShare.findUnique({
      where: { vaultEntryId_sharedWithId: { vaultEntryId: id, sharedWithId: userId } },
      include: {
        sharedBy: { select: { name: true } },
        vaultEntry: {
          include: {
            workspace: { select: { name: true } },
            createdBy: { select: { name: true } },
            updatedBy: { select: { name: true } },
          },
        },
      },
    });
    if (!share) throw new NotFoundError();
    const entry = share.vaultEntry;
    const secret = decryptValue(
      { ciphertext: entry.ciphertext, iv: entry.iv, authTag: entry.authTag },
      encryptionKey("vault"),
      `automa-tasks:vault:${entry.workspaceId}:${entry.id}`,
    );
    await recordAudit(tx, {
      workspaceId: entry.workspaceId,
      actorId: userId,
      action: "vault.shared_revealed",
      entityType: "vault_entry",
      entityId: id,
      summary: "Um usuário com acesso compartilhado revelou um item do vault.",
    });
    return { ...mapSharedVault(entry, share), secret };
  });
}
