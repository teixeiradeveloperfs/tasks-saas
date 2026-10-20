import { describe, expect, it } from "vitest";

import { hashPassword, needsRehash, verifyPassword } from "@/security/password";

describe("password", () => {
  it("faz hash Argon2id e verifica a senha", async () => {
    const passwordHash = await hashPassword("uma senha longa de teste");
    expect(passwordHash).toContain("argon2id");
    expect(await verifyPassword(passwordHash, "uma senha longa de teste")).toBe(true);
    expect(await verifyPassword(passwordHash, "senha errada")).toBe(false);
    expect(needsRehash(passwordHash)).toBe(false);
  });
});
