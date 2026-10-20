import { describe, expect, it } from "vitest";

import { decryptValue, encryptValue } from "@/security/encryption";

describe("criptografia autenticada", () => {
  it("usa AES-GCM com IV aleatório, AAD e detecta adulteração", () => {
    const key = Buffer.alloc(32, 7);
    const first = encryptValue("segredo crítico", key, "workspace:1");
    const second = encryptValue("segredo crítico", key, "workspace:1");
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(decryptValue(first, key, "workspace:1")).toBe("segredo crítico");
    expect(() => decryptValue(first, key, "workspace:2")).toThrow();
    expect(() =>
      decryptValue(
        { ...first, ciphertext: `${first.ciphertext.slice(0, -2)}AA` },
        key,
        "workspace:1",
      ),
    ).toThrow();
  });
});
