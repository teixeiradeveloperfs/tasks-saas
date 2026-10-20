import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/db/client";
import { resetDatabase } from "@/db/testing";

describe("resetDatabase", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("deixa o banco vazio antes de cada caso", async () => {
    expect(await prisma.user.count()).toBe(0);
  });

  it("apaga os dados criados pelo caso anterior", async () => {
    await prisma.user.create({
      data: { name: "Temporário", email: "temp@flow.app", avatarColor: "#000000" },
    });
    expect(await prisma.user.count()).toBe(1);
  });

  it("confirma que o caso anterior não vazou", async () => {
    expect(await prisma.user.count()).toBe(0);
  });
});
