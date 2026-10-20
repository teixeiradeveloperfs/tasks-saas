// URLs relativas de propósito: a API responde sob a mesma origem do frontend, pelo
// proxy do Vite em desenvolvimento e por um proxy reverso em produção. É isso que
// permite ao cookie de sessão seguir httpOnly e sameSite=lax.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && init.body !== null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiError("A requisição demorou demais. Tente novamente.", 504);
    }
    throw error;
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      { error?: string; code?: string } | undefined;
    if (
      (body?.code === "two_factor_required" || body?.code === "fresh_two_factor_required") &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/security/two-factor"
    ) {
      const destination = `${window.location.pathname}${window.location.search}`;
      const reauth = body.code === "fresh_two_factor_required" ? "&reauth=1" : "";
      window.location.assign(
        `/security/two-factor?redirect=${encodeURIComponent(destination)}${reauth}`,
      );
    }
    throw new ApiError(
      body?.error ?? `Falha na requisição: ${response.status}`,
      response.status,
      body?.code,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const body = (value: unknown) => (value === undefined ? undefined : JSON.stringify(value));

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: "POST", body: body(data) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: body(data) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
