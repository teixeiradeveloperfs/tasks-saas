import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "@/http/security-headers";

describe("withSecurityHeaders", () => {
  it("acrescenta os headers que valem em qualquer ambiente", () => {
    const response = withSecurityHeaders(new Response("oi"), false);

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toContain(
      "default-src 'self'",
    );
  });

  it("emite CSP bloqueante em produção", () => {
    const response = withSecurityHeaders(new Response("oi"), true);
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("Content-Security-Policy")).toContain("script-src 'self'");
    expect(response.headers.get("Content-Security-Policy")).not.toContain(
      "script-src 'self' 'unsafe-inline'",
    );
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
  });

  it("omite HSTS, mas bloqueia framing fora de produção", () => {
    const response = withSecurityHeaders(new Response("oi"), false);
    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("emite HSTS e X-Frame-Options em produção", () => {
    const response = withSecurityHeaders(new Response("oi"), true);
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("preserva status, statusText, headers e corpo", async () => {
    const original = new Response("erro", {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    const response = withSecurityHeaders(original, false);
    expect(response.status).toBe(500);
    expect(response.statusText).toBe("Internal Server Error");
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe("erro");
  });

  it("não tenta anexar corpo a respostas sem corpo", () => {
    const response = withSecurityHeaders(new Response(null, { status: 204 }), false);
    expect(response.status).toBe(204);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
