import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { encryptionKey } from "@/security/encryption";

const TEXT_PREFIX = "automa:enc:v1:";
const BINARY_MAGIC = Buffer.from("AUTOMA-ENC-V1\0", "utf8");

function encryptBytes(value: Buffer, additionalData: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey("content"), iv);
  cipher.setAAD(Buffer.from(additionalData));
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([BINARY_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

function decryptBytes(value: Buffer, additionalData: string): Buffer {
  if (!isEncryptedBuffer(value)) return value;
  const payload = value.subarray(BINARY_MAGIC.length);
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey("content"), iv);
  decipher.setAAD(Buffer.from(additionalData));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function isEncryptedText(value: string): boolean {
  return value.startsWith(TEXT_PREFIX);
}

export function encryptContentText(value: string, additionalData: string): string {
  return TEXT_PREFIX + encryptBytes(Buffer.from(value, "utf8"), additionalData).toString("base64");
}

export function decryptContentText(value: string, additionalData: string): string {
  if (!isEncryptedText(value)) return value;
  return decryptBytes(
    Buffer.from(value.slice(TEXT_PREFIX.length), "base64"),
    additionalData,
  ).toString("utf8");
}

export function isEncryptedBuffer(value: Buffer): boolean {
  return (
    value.length >= BINARY_MAGIC.length &&
    value.subarray(0, BINARY_MAGIC.length).equals(BINARY_MAGIC)
  );
}

export function encryptContentBuffer(value: Buffer, additionalData: string): Buffer {
  return encryptBytes(value, additionalData);
}

export function decryptContentBuffer(value: Buffer, additionalData: string): Buffer {
  return decryptBytes(value, additionalData);
}

export const documentContentAad = (workspaceId: string, documentId: string) =>
  `automa-tasks:document:${workspaceId}:${documentId}`;

export const whiteboardContentAad = (workspaceId: string, whiteboardId: string) =>
  `automa-tasks:whiteboard:${workspaceId}:${whiteboardId}`;

export const attachmentContentAad = (taskId: string, attachmentId: string) =>
  `automa-tasks:attachment:${taskId}:${attachmentId}`;
