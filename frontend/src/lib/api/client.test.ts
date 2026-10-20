import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./client";

describe("cliente HTTP", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("não envia Content-Type em DELETE sem corpo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.delete("/api/tasks/task-id");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(new Headers(init.headers).has("content-type")).toBe(false);
  });

  it("mantém JSON nas requisições que possuem corpo", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.post("/api/tasks", { title: "Teste" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("preserva o código estruturado de erros de segurança", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "Confirme a autenticação em duas etapas para continuar.",
            code: "two_factor_required",
          }),
          { status: 403 },
        ),
      ),
    );

    await expect(api.get("/api/board")).rejects.toMatchObject({
      status: 403,
      code: "two_factor_required",
    });
  });
});
