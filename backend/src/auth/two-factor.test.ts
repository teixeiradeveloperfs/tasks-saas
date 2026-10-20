import { describe, expect, it } from "vitest";

import {
  generateRecoveryCodes,
  generateTotpSecret,
  recoveryCodeHash,
  verifyTotp,
} from "@/auth/two-factor";

describe("TOTP e recuperação", () => {
  it("valida o vetor SHA-1 do RFC 6238 usando seis dígitos", () => {
    const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(verifyTotp(rfcSecret, "287082", 59_000)).toBe(true);
    expect(verifyTotp(rfcSecret, "000000", 59_000)).toBe(false);
  });

  it("gera segredo e códigos de recuperação fortes e únicos", () => {
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^[A-Z0-9_-]{4}-[A-Z0-9_-]{4}-[A-Z0-9_-]{4}$/.test(code))).toBe(
      true,
    );
    expect(recoveryCodeHash("user-1", codes[0]!)).not.toContain(codes[0]!);
  });
});
