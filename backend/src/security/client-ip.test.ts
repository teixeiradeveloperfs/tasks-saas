import { describe, expect, it } from "vitest";
import { resolveClientIp } from "@/security/client-ip";

describe("resolveClientIp", () => {
  it("devolve null quando não há header confiável configurado", () => {
    expect(
      resolveClientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }), undefined),
    ).toBeNull();
  });

  it("lê o header configurado", () => {
    expect(
      resolveClientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }), "x-forwarded-for"),
    ).toBe("203.0.113.7");
  });

  it("devolve null quando o header configurado não veio", () => {
    expect(resolveClientIp(new Headers(), "x-forwarded-for")).toBeNull();
  });

  it("usa o último salto da cadeia", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.7" });
    expect(resolveClientIp(headers, "x-forwarded-for")).toBe("203.0.113.7");
  });

  it("ignora espaços e entradas vazias na cadeia", () => {
    const headers = new Headers({ "x-forwarded-for": " 1.2.3.4 ,  , 203.0.113.7 " });
    expect(resolveClientIp(headers, "x-forwarded-for")).toBe("203.0.113.7");
  });

  it("devolve null quando o header veio vazio", () => {
    expect(
      resolveClientIp(new Headers({ "x-forwarded-for": "   " }), "x-forwarded-for"),
    ).toBeNull();
  });
});
