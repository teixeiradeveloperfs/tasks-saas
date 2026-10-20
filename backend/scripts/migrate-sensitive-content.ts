import {
  attachmentContentAad,
  documentContentAad,
  encryptContentBuffer,
  encryptContentText,
  isEncryptedBuffer,
  isEncryptedText,
} from "@/security/content-encryption";
import { prisma } from "@/db/client";

function withoutDocumentBody(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { body: _body, ...safe } = value as Record<string, unknown>;
  return safe;
}

async function migrateDocuments() {
  let cursor: string | undefined;
  let migrated = 0;
  for (;;) {
    const rows = await prisma.doc.findMany({
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, workspaceId: true, body: true },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      if (!isEncryptedText(row.body)) {
        await prisma.doc.update({
          where: { id: row.id },
          data: {
            body: encryptContentText(row.body, documentContentAad(row.workspaceId, row.id)),
          },
        });
        migrated += 1;
      }
    }
    cursor = rows.at(-1)!.id;
  }
  return migrated;
}

async function migrateAttachments() {
  let cursor: string | undefined;
  let migrated = 0;
  for (;;) {
    const rows = await prisma.attachment.findMany({
      orderBy: { id: "asc" },
      take: 25,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, taskId: true, data: true },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const data = Buffer.from(row.data);
      if (!isEncryptedBuffer(data)) {
        await prisma.attachment.update({
          where: { id: row.id },
          data: {
            data: Uint8Array.from(
              encryptContentBuffer(data, attachmentContentAad(row.taskId, row.id)),
            ),
          },
        });
        migrated += 1;
      }
    }
    cursor = rows.at(-1)!.id;
  }
  return migrated;
}

async function redactDocumentAudit() {
  const rows = await prisma.auditEvent.findMany({
    where: { entityType: "doc", OR: [{ before: { not: null } }, { after: { not: null } }] },
    select: { id: true, before: true, after: true },
  });
  for (const row of rows) {
    await prisma.auditEvent.update({
      where: { id: row.id },
      data: {
        before: withoutDocumentBody(row.before) as never,
        after: withoutDocumentBody(row.after) as never,
      },
    });
  }
  return rows.length;
}

async function main() {
  const documents = await migrateDocuments();
  const attachments = await migrateAttachments();
  const auditEvents = await redactDocumentAudit();
  process.stdout.write(
    `Migração concluída: ${documents} documentos e ${attachments} anexos criptografados; ${auditEvents} eventos de auditoria saneados.\n`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
