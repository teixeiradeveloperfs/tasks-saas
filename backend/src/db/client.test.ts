import { describe, expect, it } from "vitest";
import { prisma } from "@/db/client";

describe("cliente Prisma", () => {
  it("conecta no banco e responde a uma consulta", async () => {
    const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    expect(rows[0].ok).toBe(1);
  });

  it("devolve sempre a mesma instância", async () => {
    const again = await import("@/db/client");
    expect(again.prisma).toBe(prisma);
  });
});
