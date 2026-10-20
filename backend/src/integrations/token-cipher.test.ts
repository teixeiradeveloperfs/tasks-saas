import { describe, expect, it } from "vitest";

import { decryptToken, encryptToken } from "@/integrations/token-cipher";

describe("criptografia de tokens OAuth", () => {
  const key = Buffer.alloc(32, 9).toString("base64");

  it("protege e recupera um refresh token", () => {
    const encrypted = encryptToken("refresh-token-secreto", key);
    expect(encrypted).not.toContain("refresh-token-secreto");
    expect(decryptToken(encrypted, key)).toBe("refresh-token-secreto");
  });

  it("recusa conteúdo adulterado", () => {
    const encrypted = encryptToken("token", key);
    expect(() => decryptToken(`${encrypted}x`, key)).toThrow();
  });
});
