import { describe, expect, it } from "vitest";

import {
  decryptContentBuffer,
  decryptContentText,
  encryptContentBuffer,
  encryptContentText,
  isEncryptedBuffer,
  isEncryptedText,
} from "@/security/content-encryption";

describe("criptografia de documentos e anexos", () => {
  it("protege texto com AAD e mantém leitura temporária do legado", () => {
    const encrypted = encryptContentText("documento confidencial", "doc:1");
    expect(isEncryptedText(encrypted)).toBe(true);
    expect(encrypted).not.toContain("documento confidencial");
    expect(decryptContentText(encrypted, "doc:1")).toBe("documento confidencial");
    expect(decryptContentText("texto legado", "doc:1")).toBe("texto legado");
    expect(() => decryptContentText(encrypted, "doc:2")).toThrow();
  });

  it("protege bytes e detecta adulteração", () => {
    const encrypted = encryptContentBuffer(Buffer.from("arquivo sigiloso"), "attachment:1");
    expect(isEncryptedBuffer(encrypted)).toBe(true);
    expect(encrypted.includes(Buffer.from("arquivo sigiloso"))).toBe(false);
    expect(decryptContentBuffer(encrypted, "attachment:1").toString()).toBe("arquivo sigiloso");
    encrypted[encrypted.length - 1] ^= 1;
    expect(() => decryptContentBuffer(encrypted, "attachment:1")).toThrow();
  });
});
