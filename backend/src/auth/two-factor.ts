import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";

import { prisma } from "@/db/client";
import {
  decryptValue,
  encryptValue,
  encryptionKey,
  packEncryptedValue,
  unpackEncryptedValue,
} from "@/security/encryption";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;

function base32Encode(input: Buffer) {
  let bits = "";
  for (const byte of input) bits += byte.toString(2).padStart(8, "0");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    result += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(input: string) {
  let bits = "";
  for (const character of input.replace(/=+$/g, "").toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Segredo TOTP inválido.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpAt(secret: string, timestamp: number) {
  const counter = Math.floor(timestamp / 1000 / TOTP_PERIOD_SECONDS);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function matchingTotpCounter(secret: string, candidate: string, now = Date.now()) {
  const normalized = candidate.replace(/\s|-/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  for (const offset of [-1, 0, 1]) {
    const timestamp = now + offset * TOTP_PERIOD_SECONDS * 1000;
    const expected = Buffer.from(totpAt(secret, timestamp));
    const actual = Buffer.from(normalized);
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) {
      return Math.floor(timestamp / 1000 / TOTP_PERIOD_SECONDS);
    }
  }
  return null;
}

export function verifyTotp(secret: string, candidate: string, now = Date.now()) {
  return matchingTotpCounter(secret, candidate, now) !== null;
}

function secretAad(userId: string) {
  return `automa-tasks:totp:${userId}`;
}

export function encryptTotpSecret(userId: string, secret: string) {
  return packEncryptedValue(encryptValue(secret, encryptionKey("two-factor"), secretAad(userId)));
}

export function decryptTotpSecret(userId: string, encrypted: string) {
  return decryptValue(
    unpackEncryptedValue(encrypted),
    encryptionKey("two-factor"),
    secretAad(userId),
  );
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function recoveryCodeHash(userId: string, code: string) {
  const normalized = code.replace(/\s|-/g, "").toUpperCase();
  return createHash("sha256").update(`${userId}:${normalized}`).digest("hex");
}

export function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const raw = randomBytes(9).toString("base64url").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

export async function createTwoFactorSetup(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, twoFactorEnabledAt: true, twoFactorPendingSecretEncrypted: true },
  });
  if (user.twoFactorEnabledAt)
    throw Object.assign(new Error("O 2FA já está ativo."), { statusCode: 409 });
  const secret = user.twoFactorPendingSecretEncrypted
    ? decryptTotpSecret(userId, user.twoFactorPendingSecretEncrypted)
    : generateTotpSecret();
  if (!user.twoFactorPendingSecretEncrypted) {
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorPendingSecretEncrypted: encryptTotpSecret(userId, secret) },
    });
  }
  const label = encodeURIComponent(`Taskora:${user.email}`);
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("Taskora")}&algorithm=SHA1&digits=6&period=30`;
  return {
    secret,
    otpauthUri: uri,
    qrCodeDataUrl: await QRCode.toDataURL(uri, { width: 240, margin: 1 }),
  };
}
