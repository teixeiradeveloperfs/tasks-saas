import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { getEnv } from "@/config/env";

export type EncryptedValue = { ciphertext: string; iv: string; authTag: string };

export class EncryptionConfigurationError extends Error {
  statusCode = 503;
  statusMessage = "A criptografia do servidor ainda não foi configurada.";
}

export function encryptionKey(scope: "two-factor" | "vault" | "content") {
  const env = getEnv();
  const configured =
    scope === "two-factor"
      ? env.TWO_FACTOR_ENCRYPTION_KEY
      : scope === "vault"
        ? env.VAULT_ENCRYPTION_KEY
        : env.CONTENT_ENCRYPTION_KEY;
  const encoded =
    configured ??
    (env.NODE_ENV !== "production"
      ? (env.VAULT_ENCRYPTION_KEY ?? env.GOOGLE_TOKEN_ENCRYPTION_KEY)
      : undefined);
  if (!encoded) throw new EncryptionConfigurationError();
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new EncryptionConfigurationError();
  return key;
}

export function encryptValue(value: string, key: Buffer, additionalData: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(additionalData));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptValue(
  encrypted: EncryptedValue,
  key: Buffer,
  additionalData: string,
): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAAD(Buffer.from(additionalData));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function packEncryptedValue(value: EncryptedValue) {
  return `${value.iv}.${value.authTag}.${value.ciphertext}`;
}

export function unpackEncryptedValue(value: string): EncryptedValue {
  const [iv, authTag, ciphertext] = value.split(".");
  if (!iv || !authTag || !ciphertext) throw new Error("Valor criptografado inválido.");
  return { iv, authTag, ciphertext };
}
