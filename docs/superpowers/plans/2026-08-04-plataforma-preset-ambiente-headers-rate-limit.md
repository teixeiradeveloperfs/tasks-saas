# Endurecimento da plataforma — Preset, Ambiente, Headers, Rate-limit e CSRF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar a plataforma pronta para receber autenticação: alvo de build fixado em Node, variáveis de ambiente validadas no arranque, headers de segurança em toda resposta, rate-limit por IP e proteção contra CSRF.

**Architecture:** Quatro unidades puras e testáveis sem rede nem banco — `config/env.ts`, `http/security-headers.ts`, `security/client-ip.ts`, `security/rate-limit.ts` — mais a fiação em dois pontos que já existem: `src/backend/ssr/application.ts` (boundary de transporte, onde entram os headers) e `src/start.ts` (`requestMiddleware`, onde entram rate-limit e CSRF). Nenhuma dependência nova além de `@types/node`, que já está instalado.

**Tech Stack:** TanStack Start 1.168 · Nitro 3.0.260603-beta · zod 3.24 · vitest 4 · TypeScript 5.8 · Node 22

**Escopo deste plano:** somente plataforma. Credenciais, sessão, login e autorização são os planos 2.2 a 2.5. Este plano não toca em `prisma/schema.prisma` nem cria server function alguma.

**Spec:** `docs/superpowers/specs/2026-08-04-identidade-e-acesso-design.md`

---

## Ambiente já verificado

Confirmado neste repositório antes de escrever o plano — não precisa reverificar:

| Item | Estado |
| --- | --- |
| `createMiddleware` | Já usado em `src/start.ts:5`, importado de `@tanstack/react-start` |
| Assinatura do middleware de request | `({ request, pathname, context, next, handlerType })` — `createMiddleware.d.ts:175-187` |
| `createCsrfMiddleware` | **Existe e é exportado** de `@tanstack/react-start` (`index.d.ts:3`) |
| Preset padrão do Nitro | `cloudflare-module`, vindo de `@lovable.dev/vite-tanstack-config/dist/index.js:577` |
| Sobrescrita no sandbox | `index.js:579-582` força `cloudflare-module` quando `LOVABLE_SANDBOX=1` ou `DEV_SERVER__PROJECT_PATH` existe |
| zod | 3.24.2, em `dependencies` (`package.json:76`) |
| `include` do tsconfig | Já cobre `src/**`, `prisma/**`, `vite.config.ts`, `vitest.config.ts` |
| vitest | `fileParallelism: false`, `setupFiles: ["src/backend/db/testing.ts"]` |
| Suíte atual | 17 testes passando |

O `setupFiles` do vitest troca `DATABASE_URL` pela URL de teste **antes** de qualquer teste rodar. Os módulos deste plano são lidos depois disso, então enxergam a configuração de teste — é o comportamento desejado.

## File Structure

| Arquivo | Responsabilidade |
| --- | --- |
| `vite.config.ts` | Modificado: fixa `nitro: { preset: "node-server" }` |
| `src/backend/config/runtime.ts` | Detecta se o processo roda em Node. Mitiga o risco R1 |
| `src/backend/config/runtime.test.ts` | Testes da detecção |
| `src/backend/config/env.ts` | Lê e valida as variáveis de ambiente com zod. Falha no arranque |
| `src/backend/config/env.test.ts` | Testes da validação |
| `src/backend/db/client.ts` | Modificado: passa a ler de `env.ts` |
| `src/backend/http/security-headers.ts` | Acrescenta headers de segurança a uma `Response` |
| `src/backend/http/security-headers.test.ts` | Testes dos headers |
| `src/backend/ssr/application.ts` | Modificado: aplica os headers nos três caminhos de retorno |
| `src/backend/security/client-ip.ts` | Resolve o IP do cliente a partir do header confiável |
| `src/backend/security/client-ip.test.ts` | Testes da resolução, incluindo cadeia de proxies |
| `src/backend/security/rate-limit.ts` | Interface `RateLimitStore` + implementação em memória |
| `src/backend/security/rate-limit.test.ts` | Testes de janela, expiração e crescimento de memória |
| `src/start.ts` | Modificado: registra rate-limit e CSRF em `requestMiddleware` |
| `.env` / `.env.example` | Modificados: variáveis novas |
| `README.md` | Modificado: documenta as variáveis |

---

## Task 1: Fixar o alvo de build em Node

O `vite.config.ts` não declara preset, então o build herda `cloudflare-module` do config do Lovable. Isso decidiria por conta própria três coisas deste sub-projeto: hash de senha não poderia usar módulo nativo, rate-limit em memória não funcionaria entre isolates, e o Prisma precisaria de outro driver. A decisão registrada na spec é Node em contêiner próprio.

**Files:**
- Modify: `vite.config.ts`
- Create: `src/backend/config/runtime.ts`
- Test: `src/backend/config/runtime.test.ts`

- [ ] **Step 1: Declarar o preset no `vite.config.ts`**

Substitua o `defineConfig` por:

```ts
export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // O padrão herdado de @lovable.dev/vite-tanstack-config é "cloudflare-module"
  // (dist/index.js:577). O alvo deste projeto é Node em contêiner próprio: Prisma
  // sobre TCP, argon2 nativo e rate-limit em processo dependem disso.
  nitro: { preset: "node-server" },
});
```

- [ ] **Step 2: Escrever o teste que falha**

`src/backend/config/runtime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isNodeRuntime, assertNodeRuntime } from "@/backend/config/runtime";

describe("isNodeRuntime", () => {
  it("reconhece o Node", () => {
    expect(isNodeRuntime("node")).toBe(true);
  });

  it("recusa runtime de edge, onde process.release não existe", () => {
    expect(isNodeRuntime(undefined)).toBe(false);
  });

  it("recusa qualquer outro runtime nomeado", () => {
    expect(isNodeRuntime("workerd")).toBe(false);
  });
});

describe("assertNodeRuntime", () => {
  it("não lança quando roda em Node", () => {
    expect(() => assertNodeRuntime("node")).not.toThrow();
  });

  it("lança citando o preset quando não é Node", () => {
    expect(() => assertNodeRuntime(undefined)).toThrow(/node-server/);
  });
});
```

- [ ] **Step 3: Rodar o teste para verificar que falha**

```bash
npm test src/backend/config/runtime.test.ts
```

Esperado: **FALHA** com `Failed to resolve import "@/backend/config/runtime"`.

- [ ] **Step 4: Implementar**

`src/backend/config/runtime.ts`:

```ts
/**
 * O config do Lovable força o preset "cloudflare-module" quando o build sai do sandbox
 * dele (dist/index.js:579-582), descartando o preset declarado em vite.config.ts. Um
 * artefato assim sobe e só quebra na primeira senha verificada ou no primeiro pico de
 * tráfego. Esta verificação transforma isso numa falha imediata e nomeada.
 */
export function isNodeRuntime(releaseName: string | undefined): boolean {
  return releaseName === "node";
}

// O parâmetro é obrigatório de propósito. Um default (`= process.release?.name`) não
// serviria: em JavaScript o default também dispara quando o chamador passa `undefined`
// explicitamente, então o caso que mais importa testar — runtime sem `process.release` —
// leria o processo real e nunca lançaria. Quem chama passa `process.release?.name`.
export function assertNodeRuntime(releaseName: string | undefined): void {
  if (isNodeRuntime(releaseName)) return;

  throw new Error(
    "Este artefato não está rodando em Node. O projeto exige o preset " +
      'nitro: { preset: "node-server" } em vite.config.ts — argon2 e o rate-limit ' +
      "em memória não funcionam fora do Node. Se o build saiu do sandbox do Lovable, " +
      "o preset foi sobrescrito para cloudflare-module: publique pelo pipeline próprio.",
  );
}
```

- [ ] **Step 5: Rodar o teste para verificar que passa**

```bash
npm test src/backend/config/runtime.test.ts
```

Esperado: PASS, 5 testes.

- [ ] **Step 6: Confirmar o alvo do build**

```bash
npm run build
```

Depois, verificar o que foi produzido:

```bash
ls .output/server/index.mjs
```

Esperado: o arquivo existe. É o entry do preset `node-server`.

Se `.output/` não existir e o build tiver escrito em `dist/server/`, o caminho do sandbox foi tomado — confira se `LOVABLE_SANDBOX` ou `DEV_SERVER__PROJECT_PATH` estão definidas no seu ambiente com `env | grep -E "LOVABLE|DEV_SERVER"`. Nesse caso o preset foi sobrescrito e a Task não está concluída.

- [ ] **Step 7: Confirmar que o dev server continua subindo**

```bash
npm run dev
```

Esperado: o app abre normalmente. O preset só afeta `build`. Encerre com Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts src/backend/config/runtime.ts src/backend/config/runtime.test.ts
git commit -m "Fixa o alvo de build em Node e detecta runtime incompatível"
```

---

## Task 1b: Tornar o `npm run lint` utilizável no Windows

Descoberto durante a execução da Task 1, não previsto no plano original.

`npm run lint` reporta **9130 erros** no repositório inteiro, todos `prettier/prettier: Delete ␍`. A causa é a combinação de `core.autocrlf=true` no git — que entrega CRLF ao working copy no Windows — com o padrão `endOfLine: "lf"` do prettier, que exige LF. Nenhum desses erros tem a ver com o código; são o caractere de fim de linha.

Isso importa para além do incômodo. A spec registra como risco **R2** que o Lovable escreve neste mesmo repositório e pode desfazer proteções em silêncio, e a mitigação prevista são regras de ESLint nos planos 2.4 e 2.5. Uma verificação que sempre falha com 9130 erros é uma verificação que ninguém roda — a mitigação nasceria morta.

A correção é uma linha: `endOfLine: "auto"` faz o prettier aceitar o fim de linha que o arquivo já tem, em vez de impor um. Alternativas descartadas: normalizar os arquivos com `--write` produziria um diff gigante em código que ninguém tocou; um `.gitattributes` com `text=auto eol=lf` mexeria no checkout de todo mundo para resolver um problema de configuração do formatador.

**Files:**
- Modify: `.prettierrc`

- [ ] **Step 1: Confirmar o tamanho do problema**

```bash
npx eslint . 2>&1 | tail -3
```

Esperado: por volta de `9130 problems`, quase todos `Delete ␍`.

- [ ] **Step 2: Acrescentar a opção ao `.prettierrc`**

```json
{
  "printWidth": 100,
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "endOfLine": "auto"
}
```

- [ ] **Step 3: Confirmar que o ruído sumiu**

```bash
npx eslint . 2>&1 | tail -3
```

Esperado: nenhum erro `Delete ␍`. Erros restantes, se houver, são de código de verdade e ficam para quem os introduziu.

- [ ] **Step 4: Confirmar que nada mais mudou**

```bash
git status --short
```

Esperado: apenas `M .prettierrc`. Se aparecerem arquivos de código modificados, algum comando rodou com `--write` — desfaça com `git checkout --` nesses arquivos.

- [ ] **Step 5: Commit**

```bash
git add .prettierrc
git commit -m "Aceita CRLF no prettier para o lint funcionar no Windows"
```

---

## Task 2: Configuração de ambiente validada no arranque

`src/backend/db/client.ts:11-15` já valida `DATABASE_URL` à mão. A partir daqui entram mais variáveis, e descobrir que uma está faltando pelo comportamento — em vez de por uma mensagem no arranque — custa horas. Este módulo centraliza e falha alto.

A função de parse é separada do singleton justamente para ser testável sem mexer em `process.env`, que é estado global compartilhado entre os testes.

**Files:**
- Create: `src/backend/config/env.ts`
- Test: `src/backend/config/env.test.ts`
- Modify: `src/backend/db/client.ts`
- Modify: `.env`, `.env.example`

- [ ] **Step 1: Acrescentar as variáveis novas ao `.env`**

Acrescente ao final de `.env` (não versionado):

```dotenv
# Origem pública do app. Usada pela verificação de CSRF.
APP_ORIGIN="http://localhost:3000"

# Header que carrega o IP real do cliente, escrito pelo proxy à frente do app.
# Em desenvolvimento não há proxy: deixe vazio e o rate-limit usará uma chave única.
# Em produção é obrigatória — sem ela o IP é forjável e o rate-limit não protege nada.
TRUSTED_PROXY_HEADER=""
```

- [ ] **Step 2: Espelhar em `.env.example`**

Acrescente ao final de `.env.example` (versionado, sem segredo):

```dotenv
# Origem pública do app. Usada pela verificação de CSRF.
APP_ORIGIN="http://localhost:3000"

# Header que carrega o IP real do cliente, escrito pelo proxy à frente do app.
# Em desenvolvimento não há proxy: deixe vazio.
# Em produção é obrigatória. Exemplos: "x-forwarded-for" atrás de nginx/Traefik.
TRUSTED_PROXY_HEADER=""
```

- [ ] **Step 3: Escrever o teste que falha**

`src/backend/config/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/backend/config/env";

const valido = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://flow:senha@localhost:5433/flow_dev?schema=public",
  TEST_DATABASE_URL: "postgresql://flow:senha@localhost:5433/flow_test?schema=public",
  APP_ORIGIN: "http://localhost:3000",
  TRUSTED_PROXY_HEADER: "",
};

describe("parseEnv", () => {
  it("aceita uma configuração completa de desenvolvimento", () => {
    const env = parseEnv(valido);
    expect(env.APP_ORIGIN).toBe("http://localhost:3000");
    expect(env.NODE_ENV).toBe("development");
  });

  it("assume development quando NODE_ENV está ausente", () => {
    const { NODE_ENV, ...semNodeEnv } = valido;
    expect(parseEnv(semNodeEnv).NODE_ENV).toBe("development");
  });

  it("recusa DATABASE_URL ausente, nomeando a variável", () => {
    const { DATABASE_URL, ...semBanco } = valido;
    expect(() => parseEnv(semBanco)).toThrow(/DATABASE_URL/);
  });

  it("recusa APP_ORIGIN que não é uma URL", () => {
    expect(() => parseEnv({ ...valido, APP_ORIGIN: "localhost:3000" })).toThrow(/APP_ORIGIN/);
  });

  it("trata string vazia em TRUSTED_PROXY_HEADER como ausente", () => {
    expect(parseEnv(valido).TRUSTED_PROXY_HEADER).toBeUndefined();
  });

  it("exige TRUSTED_PROXY_HEADER em produção", () => {
    expect(() => parseEnv({ ...valido, NODE_ENV: "production" })).toThrow(
      /TRUSTED_PROXY_HEADER/,
    );
  });

  it("aceita produção quando TRUSTED_PROXY_HEADER está preenchida", () => {
    const env = parseEnv({
      ...valido,
      NODE_ENV: "production",
      TRUSTED_PROXY_HEADER: "x-forwarded-for",
    });
    expect(env.TRUSTED_PROXY_HEADER).toBe("x-forwarded-for");
  });

  it("reúne todos os campos inválidos numa única mensagem", () => {
    const { DATABASE_URL, ...quebrado } = valido;
    const erro = (() => {
      try {
        parseEnv({ ...quebrado, APP_ORIGIN: "não é url" });
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    })();

    expect(erro).toMatch(/DATABASE_URL/);
    expect(erro).toMatch(/APP_ORIGIN/);
  });
});
```

- [ ] **Step 4: Rodar o teste para verificar que falha**

```bash
npm test src/backend/config/env.test.ts
```

Esperado: **FALHA** com `Failed to resolve import "@/backend/config/env"`.

- [ ] **Step 5: Implementar**

`src/backend/config/env.ts`:

```ts
import "dotenv/config";
import { z } from "zod";

// Variáveis opcionais chegam como "" quando o .env traz a chave vazia. Sem isto,
// TRUSTED_PROXY_HEADER="" passaria como valor válido e o rate-limit leria um header
// de nome vazio, que nunca existe.
const vazioComoAusente = z
  .string()
  .transform((valor) => (valor.trim() === "" ? undefined : valor.trim()))
  .optional();

// Não use `z.string().url()` aqui. Ele apenas tenta `new URL(valor)`, e
// `new URL("localhost:3000")` não lança — parseia como protocolo "localhost:". O mesmo
// vale para "ftp://x.com". Uma origem precisa de esquema http(s) e host.
const origemHttp = z.string().refine((valor) => {
  try {
    const url = new URL(valor);
    return (url.protocol === "http:" || url.protocol === "https:") && url.host !== "";
  } catch {
    return false;
  }
}, "precisa ser uma origem http(s) completa, ex.: http://localhost:3000");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: vazioComoAusente,
  APP_ORIGIN: origemHttp,
  TRUSTED_PROXY_HEADER: vazioComoAusente,
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const resultado = schema.safeParse(source);

  if (!resultado.success) {
    const campos = resultado.error.issues
      .map((problema) => `  ${problema.path.join(".") || "(raiz)"}: ${problema.message}`)
      .join("\n");

    throw new Error(
      `Configuração de ambiente inválida:\n${campos}\n\n` +
        "Copie .env.example para .env e preencha as variáveis.",
    );
  }

  const env = resultado.data;

  // Não é uma regra de formato, é uma regra de segurança: sem proxy confiável declarado,
  // o IP do cliente vem de um header que qualquer um forja, e limitar por IP não limita nada.
  if (env.NODE_ENV === "production" && !env.TRUSTED_PROXY_HEADER) {
    throw new Error(
      "Configuração de ambiente inválida:\n" +
        "  TRUSTED_PROXY_HEADER: obrigatória quando NODE_ENV=production.\n\n" +
        "Sem ela o IP do cliente é forjável e o rate-limit não protege nada.",
    );
  }

  return env;
}

let cache: Env | undefined;

/**
 * Lê e valida `process.env` na primeira chamada; devolve o mesmo objeto nas seguintes.
 *
 * A leitura é preguiçosa de propósito: `src/backend/db/testing.ts` troca
 * `process.env.DATABASE_URL` pela URL de teste antes de importar o cliente Prisma, e
 * validar no carregamento do módulo leria a configuração errada.
 */
export function getEnv(): Env {
  cache ??= parseEnv(process.env);
  return cache;
}
```

- [ ] **Step 6: Rodar o teste para verificar que passa**

```bash
npm test src/backend/config/env.test.ts
```

Esperado: PASS, 8 testes.

- [ ] **Step 7: Fazer o cliente Prisma ler da configuração validada**

Substitua o corpo de `createClient()` em `src/backend/db/client.ts`. O `import` novo vai junto dos existentes no topo:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/backend/config/env";

// O hot reload do Vite reavalia este módulo a cada alteração. Guardar a instância
// no escopo global impede que as conexões se acumulem até o Postgres recusar novas.
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function createClient() {
  // getEnv() valida o ambiente inteiro e falha nomeando o que estiver faltando.
  const connectionString = getEnv().DATABASE_URL;

  // No Prisma 7 o cliente não lê a URL do schema — a conexão vem deste adapter.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

Detalhe que importa: `src/backend/db/testing.ts:1033` troca `process.env.DATABASE_URL` pela URL de teste e só depois importa o cliente dinamicamente. Como `getEnv()` só lê `process.env` na primeira chamada — que acontece dentro de `createClient()`, já depois da troca — os testes continuam apontando para `flow_test`.

- [ ] **Step 8: Rodar a suíte inteira**

```bash
npm test
```

Esperado: PASS, 30 testes (17 anteriores + 5 da Task 1 + 8 desta).

Se falhar com `APP_ORIGIN: Required`, o Step 1 não foi aplicado: `.env` precisa da variável antes de o cliente Prisma passar por `getEnv()`.

- [ ] **Step 9: Confirmar que `.env` continua fora do controle de versão**

```bash
git status --short
```

Esperado: `.env` **não** aparece na listagem.

- [ ] **Step 10: Commit**

```bash
git add src/backend/config/env.ts src/backend/config/env.test.ts src/backend/db/client.ts .env.example
git commit -m "Valida as variáveis de ambiente no arranque"
```

---

## Task 3: Headers de segurança em toda resposta

`src/backend/ssr/application.ts` é o boundary de transporte declarado do projeto (comentário na linha 33). Hoje seus dois caminhos de erro devolvem apenas `content-type`, e o caminho de sucesso devolve o que o framework produziu.

O que **não** entra aqui: CORS. O app é same-origin e o navegador já bloqueia leitura por terceiros sem cabeçalho nenhum — a justificativa completa está na spec, seção "Por que CORS não entra".

**Files:**
- Create: `src/backend/http/security-headers.ts`
- Test: `src/backend/http/security-headers.test.ts`
- Modify: `src/backend/ssr/application.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/backend/http/security-headers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "@/backend/http/security-headers";

describe("withSecurityHeaders", () => {
  it("acrescenta os headers que valem em qualquer ambiente", () => {
    const resposta = withSecurityHeaders(new Response("oi"), false);

    expect(resposta.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(resposta.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(resposta.headers.get("Permissions-Policy")).toContain("camera=()");
    expect(resposta.headers.get("Content-Security-Policy-Report-Only")).toContain(
      "default-src 'self'",
    );
  });

  it("não emite CSP bloqueante — só o modo relatório", () => {
    const resposta = withSecurityHeaders(new Response("oi"), true);
    expect(resposta.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("omite HSTS e X-Frame-Options fora de produção", () => {
    const resposta = withSecurityHeaders(new Response("oi"), false);

    // HSTS em localhost contamina todo projeto servido na mesma porta.
    expect(resposta.headers.get("Strict-Transport-Security")).toBeNull();
    // O preview do Lovable roda o app dentro de um iframe.
    expect(resposta.headers.get("X-Frame-Options")).toBeNull();
  });

  it("emite HSTS e X-Frame-Options em produção", () => {
    const resposta = withSecurityHeaders(new Response("oi"), true);

    expect(resposta.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(resposta.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("preserva status, statusText e headers já existentes", async () => {
    const original = new Response("erro", {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    const resposta = withSecurityHeaders(original, false);

    expect(resposta.status).toBe(500);
    expect(resposta.statusText).toBe("Internal Server Error");
    expect(resposta.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await resposta.text()).toBe("erro");
  });

  it("não tenta anexar corpo a respostas que não podem ter um", () => {
    const resposta = withSecurityHeaders(new Response(null, { status: 204 }), false);

    expect(resposta.status).toBe(204);
    expect(resposta.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
```

- [ ] **Step 2: Rodar o teste para verificar que falha**

```bash
npm test src/backend/http/security-headers.test.ts
```

Esperado: **FALHA** com `Failed to resolve import "@/backend/http/security-headers"`.

- [ ] **Step 3: Implementar**

`src/backend/http/security-headers.ts`:

```ts
// Modo relatório, não bloqueante. Bloquear de verdade exige nonce nos scripts de
// hidratação que o TanStack Start injeta inline — trabalho separado, fora deste plano.
// Enquanto isso, o navegador reporta violações no console sem quebrar a página.
const CSP_RELATORIO = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Tailwind e Radix injetam estilo inline o tempo todo.
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "object-src 'none'",
].join("; ");

const PERMISSOES_NEGADAS = ["camera=()", "microphone=()", "geolocation=()", "payment=()"].join(
  ", ",
);

// 204 e 304 não podem carregar corpo: passar um a `new Response` lança TypeError.
const SEM_CORPO = new Set([204, 205, 304]);

/**
 * Devolve uma cópia da resposta com os headers de segurança acrescentados.
 * `Response.headers` pode vir com guarda de imutabilidade dependendo de como a
 * resposta foi construída, então reconstruir é mais confiável que mutar.
 */
export function withSecurityHeaders(response: Response, isProduction: boolean): Response {
  const headers = new Headers(response.headers);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", PERMISSOES_NEGADAS);
  headers.set("Content-Security-Policy-Report-Only", CSP_RELATORIO);

  if (isProduction) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    headers.set("X-Frame-Options", "DENY");
  }

  return new Response(SEM_CORPO.has(response.status) ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
```

- [ ] **Step 4: Rodar o teste para verificar que passa**

```bash
npm test src/backend/http/security-headers.test.ts
```

Esperado: PASS, 6 testes.

- [ ] **Step 5: Aplicar os headers no boundary de transporte**

Substitua o bloco `export const application` de `src/backend/ssr/application.ts` — os `import` novos vão junto dos existentes no topo do arquivo:

```ts
import { consumeLastCapturedError } from "@/lib/error-capture";
import { renderErrorPage } from "@/lib/error-page";
import { withSecurityHeaders } from "@/backend/http/security-headers";
import { getEnv } from "@/backend/config/env";
import { assertNodeRuntime } from "@/backend/config/runtime";

// Falha no arranque, não na primeira senha verificada.
assertNodeRuntime(process.release?.name);
```

E o objeto exportado, ao final do arquivo:

```ts
/** Backend transport boundary: SSR, security headers and fatal error normalization live here. */
export const application = {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const producao = getEnv().NODE_ENV === "production";

    try {
      const resposta = await normalize(await (await entry()).fetch(request, env, ctx));
      return withSecurityHeaders(resposta, producao);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        producao,
      );
    }
  },
};
```

A resposta de erro construída dentro de `normalize()` também sai com os headers, porque passa por `withSecurityHeaders` no retorno do `try`.

- [ ] **Step 6: Verificar no servidor de verdade**

Em um terminal:

```bash
npm run dev
```

Em outro:

```bash
curl -I http://localhost:3000/
```

Esperado, entre os headers da resposta:

```
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=(), payment=()
content-security-policy-report-only: default-src 'self'; ...
```

E **ausentes**: `strict-transport-security` e `x-frame-options`. Se aparecerem, `NODE_ENV` está como `production` no seu `.env`.

- [ ] **Step 7: Confirmar que a interface não quebrou**

Abra `http://localhost:3000/` no navegador e navegue por três páginas. Esperado: layout e estilos intactos.

O console vai mostrar avisos de CSP em modo relatório — é o comportamento correto nesta fase. Anote quais aparecem: eles são a lista de trabalho para tornar a CSP bloqueante depois. Encerre o dev server com Ctrl+C.

- [ ] **Step 8: Rodar a suíte inteira**

```bash
npm test
```

Esperado: PASS, 36 testes.

- [ ] **Step 9: Commit**

```bash
git add src/backend/http/ src/backend/ssr/application.ts
git commit -m "Aplica headers de segurança em toda resposta"
```

---

## Task 4: Rate-limit amplo por IP

Duas unidades puras e uma fiação. A interface existe para que trocar a implementação por Redis, se um dia houver mais de uma instância, seja um arquivo novo em vez de uma refatoração — a justificativa está na spec, seção "Por que Redis não entra".

Este limite é **amplo**: protege contra varredura, não contra força bruta em login. O limite estrito das rotas de autenticação é o plano 2.4, e depende deste código.

**Files:**
- Create: `src/backend/security/client-ip.ts`
- Test: `src/backend/security/client-ip.test.ts`
- Create: `src/backend/security/rate-limit.ts`
- Test: `src/backend/security/rate-limit.test.ts`
- Modify: `src/start.ts`

- [ ] **Step 1: Escrever o teste da resolução de IP**

`src/backend/security/client-ip.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveClientIp } from "@/backend/security/client-ip";

describe("resolveClientIp", () => {
  it("devolve null quando não há header confiável configurado", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7" });
    expect(resolveClientIp(headers, undefined)).toBeNull();
  });

  it("lê o header configurado", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7" });
    expect(resolveClientIp(headers, "x-forwarded-for")).toBe("203.0.113.7");
  });

  it("devolve null quando o header configurado não veio", () => {
    expect(resolveClientIp(new Headers(), "x-forwarded-for")).toBeNull();
  });

  it("usa o último salto da cadeia, que é o que o proxy confiável escreveu", () => {
    // O cliente pode forjar os primeiros valores; só o último é confiável.
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.7" });
    expect(resolveClientIp(headers, "x-forwarded-for")).toBe("203.0.113.7");
  });

  it("ignora espaços e entradas vazias na cadeia", () => {
    const headers = new Headers({ "x-forwarded-for": " 1.2.3.4 ,  , 203.0.113.7 " });
    expect(resolveClientIp(headers, "x-forwarded-for")).toBe("203.0.113.7");
  });

  it("devolve null quando o header veio vazio", () => {
    const headers = new Headers({ "x-forwarded-for": "   " });
    expect(resolveClientIp(headers, "x-forwarded-for")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste para verificar que falha**

```bash
npm test src/backend/security/client-ip.test.ts
```

Esperado: **FALHA** com `Failed to resolve import "@/backend/security/client-ip"`.

- [ ] **Step 3: Implementar a resolução de IP**

`src/backend/security/client-ip.ts`:

```ts
/**
 * Resolve o IP do cliente a partir do header que o proxy confiável escreve.
 *
 * Sem um proxy declarado, devolve null: qualquer cliente pode mandar
 * `x-forwarded-for: <o que quiser>`, e limitar por um valor forjável não limita nada.
 * Quem chama decide o que fazer com null — em desenvolvimento, cair numa chave única.
 */
export function resolveClientIp(headers: Headers, trustedHeader: string | undefined): string | null {
  if (!trustedHeader) return null;

  const bruto = headers.get(trustedHeader);
  if (!bruto) return null;

  // A cadeia cresce da esquerda para a direita: cada proxy anexa quem falou com ele.
  // O último elemento foi escrito pelo proxy imediatamente à frente do app — o único
  // que o cliente não consegue controlar.
  const saltos = bruto
    .split(",")
    .map((parte) => parte.trim())
    .filter((parte) => parte.length > 0);

  return saltos.at(-1) ?? null;
}
```

- [ ] **Step 4: Rodar o teste para verificar que passa**

```bash
npm test src/backend/security/client-ip.test.ts
```

Esperado: PASS, 6 testes.

- [ ] **Step 5: Escrever o teste do rate-limit**

`src/backend/security/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MemoryRateLimitStore } from "@/backend/security/rate-limit";

describe("MemoryRateLimitStore", () => {
  it("permite até o limite e recusa a próxima", async () => {
    const store = new MemoryRateLimitStore();
    const agora = 1_000_000;

    expect((await store.consume("ip:1", 3, 60_000, agora)).allowed).toBe(true);
    expect((await store.consume("ip:1", 3, 60_000, agora)).allowed).toBe(true);
    expect((await store.consume("ip:1", 3, 60_000, agora)).allowed).toBe(true);
    expect((await store.consume("ip:1", 3, 60_000, agora)).allowed).toBe(false);
  });

  it("informa quantas restam", async () => {
    const store = new MemoryRateLimitStore();
    const agora = 1_000_000;

    expect((await store.consume("ip:1", 3, 60_000, agora)).remaining).toBe(2);
    expect((await store.consume("ip:1", 3, 60_000, agora)).remaining).toBe(1);
  });

  it("conta chaves diferentes de forma independente", async () => {
    const store = new MemoryRateLimitStore();
    const agora = 1_000_000;

    await store.consume("ip:1", 1, 60_000, agora);
    expect((await store.consume("ip:1", 1, 60_000, agora)).allowed).toBe(false);
    expect((await store.consume("ip:2", 1, 60_000, agora)).allowed).toBe(true);
  });

  it("devolve o crédito quando a janela passa", async () => {
    const store = new MemoryRateLimitStore();
    const agora = 1_000_000;

    await store.consume("ip:1", 1, 60_000, agora);
    expect((await store.consume("ip:1", 1, 60_000, agora)).allowed).toBe(false);
    expect((await store.consume("ip:1", 1, 60_000, agora + 60_001)).allowed).toBe(true);
  });

  it("diz em quanto tempo tentar de novo", async () => {
    const store = new MemoryRateLimitStore();
    const agora = 1_000_000;

    await store.consume("ip:1", 1, 60_000, agora);
    const recusada = await store.consume("ip:1", 1, 60_000, agora + 10_000);

    expect(recusada.retryAfterMs).toBe(50_000);
  });

  it("descarta chaves vencidas em vez de acumular memória", async () => {
    const store = new MemoryRateLimitStore();
    const agora = 1_000_000;

    for (let i = 0; i < 500; i++) {
      await store.consume(`ip:${i}`, 5, 60_000, agora);
    }
    expect(store.size).toBe(500);

    store.prune(60_000, agora + 60_001);
    expect(store.size).toBe(0);
  });

  it("preserva chaves ainda dentro da janela ao limpar", async () => {
    const store = new MemoryRateLimitStore();
    const agora = 1_000_000;

    await store.consume("antiga", 5, 60_000, agora);
    await store.consume("recente", 5, 60_000, agora + 59_000);

    store.prune(60_000, agora + 60_001);

    expect(store.size).toBe(1);
    expect((await store.consume("recente", 5, 60_000, agora + 60_001)).remaining).toBe(3);
  });
});
```

- [ ] **Step 6: Rodar o teste para verificar que falha**

```bash
npm test src/backend/security/rate-limit.test.ts
```

Esperado: **FALHA** com `Failed to resolve import "@/backend/security/rate-limit"`.

- [ ] **Step 7: Implementar o rate-limit**

`src/backend/security/rate-limit.ts`:

```ts
export type RateLimitResult = {
  allowed: boolean;
  /** Quantas requisições ainda cabem na janela. Zero quando recusada. */
  remaining: number;
  /** Quanto falta para a requisição mais antiga sair da janela. Zero quando permitida. */
  retryAfterMs: number;
};

/**
 * O único ponto de acoplamento com o armazenamento do contador.
 *
 * A implementação em memória é correta enquanto houver uma instância do servidor.
 * Com duas, cada uma contaria a sua parte e o limite efetivo dobraria — nesse dia,
 * uma implementação sobre Redis entra aqui sem que os chamadores mudem.
 */
export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number, now?: number): Promise<RateLimitResult>;
}

/** Janela deslizante: guarda o instante de cada acerto e descarta os que saíram da janela. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly acertos = new Map<string, Array<number>>();

  async consume(
    key: string,
    limit: number,
    windowMs: number,
    now: number = Date.now(),
  ): Promise<RateLimitResult> {
    const corte = now - windowMs;
    const recentes = (this.acertos.get(key) ?? []).filter((instante) => instante > corte);

    if (recentes.length >= limit) {
      this.acertos.set(key, recentes);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: recentes[0] + windowMs - now,
      };
    }

    recentes.push(now);
    this.acertos.set(key, recentes);

    return { allowed: true, remaining: limit - recentes.length, retryAfterMs: 0 };
  }

  /**
   * Descarta chaves cujos acertos saíram todos da janela. Sem isto, o mapa guarda uma
   * entrada por IP que já passou por aqui e cresce enquanto o processo viver.
   */
  prune(windowMs: number, now: number = Date.now()): void {
    const corte = now - windowMs;

    for (const [chave, instantes] of this.acertos) {
      const recentes = instantes.filter((instante) => instante > corte);
      if (recentes.length === 0) this.acertos.delete(chave);
      else this.acertos.set(chave, recentes);
    }
  }

  get size(): number {
    return this.acertos.size;
  }
}
```

- [ ] **Step 8: Rodar o teste para verificar que passa**

```bash
npm test src/backend/security/rate-limit.test.ts
```

Esperado: PASS, 7 testes.

- [ ] **Step 9: Registrar o middleware em `src/start.ts`**

Substitua o conteúdo inteiro de `src/start.ts`:

```ts
import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { getEnv } from "./backend/config/env";
import { resolveClientIp } from "./backend/security/client-ip";
import { MemoryRateLimitStore } from "./backend/security/rate-limit";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Limite amplo: existe para conter varredura automatizada, não força bruta em login.
// O limite estrito das rotas de autenticação é outro, e chega com elas.
const JANELA_MS = 60_000;
const LIMITE_POR_JANELA = 300;

// Este módulo também é carregado no navegador — só os callbacks `.server()` ficam de
// fora do bundle do cliente. Por isso o contador e o timer nascem na primeira chamada
// do middleware, que só acontece no servidor, e não no escopo do módulo.
let limitador: MemoryRateLimitStore | undefined;

function obterLimitador(): MemoryRateLimitStore {
  if (limitador) return limitador;

  limitador = new MemoryRateLimitStore();

  // Sem isto o mapa guarda uma entrada por IP que já passou por aqui, para sempre.
  const limpeza = setInterval(() => limitador?.prune(JANELA_MS), JANELA_MS);
  // unref() evita que o timer segure o processo vivo no encerramento. Existe no Node;
  // o cast cobre a tipagem de `setInterval` do DOM, que devolve number.
  (limpeza as unknown as { unref?: () => void }).unref?.();

  return limitador;
}

// Uma página carrega dezenas de arquivos com extensão; contá-los consumiria a cota
// inteira de um visitante legítimo no primeiro acesso.
const PARECE_ARQUIVO = /\.[a-z0-9]+$/i;

const rateLimitMiddleware = createMiddleware().server(async ({ request, pathname, next }) => {
  if (PARECE_ARQUIVO.test(pathname)) return next();

  const ip = resolveClientIp(request.headers, getEnv().TRUSTED_PROXY_HEADER);
  // Em desenvolvimento não há proxy confiável: todo mundo divide a mesma chave.
  // O limite é generoso o bastante para não atrapalhar quem está desenvolvendo.
  const chave = `req:${ip ?? "sem-proxy"}`;

  const resultado = await obterLimitador().consume(chave, LIMITE_POR_JANELA, JANELA_MS);

  if (!resultado.allowed) {
    return new Response("Muitas requisições. Tente novamente em instantes.", {
      status: 429,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "retry-after": String(Math.ceil(resultado.retryAfterMs / 1000)),
      },
    });
  }

  return next();
});

export const startInstance = createStart(() => ({
  // errorMiddleware primeiro: sendo o mais externo, ele captura falhas dos demais.
  requestMiddleware: [errorMiddleware, rateLimitMiddleware],
}));
```

- [ ] **Step 10: Verificar que o app continua funcionando**

```bash
npm run dev
```

Abra `http://localhost:3000/` e navegue por três páginas. Esperado: nenhuma resposta 429 durante navegação normal. Se aparecer, o filtro de arquivos não está pegando os assets — confira `PARECE_ARQUIVO` contra os caminhos que o navegador está pedindo na aba Network.

- [ ] **Step 11: Verificar que o limite realmente dispara**

Com o dev server ainda rodando, em outro terminal:

```bash
for i in $(seq 1 320); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/; done | sort | uniq -c
```

Esperado: cerca de 300 respostas `200` e o restante `429`.

Confirme o header da resposta recusada:

```bash
curl -s -D - -o /dev/null http://localhost:3000/ | grep -i retry-after
```

Esperado: uma linha `retry-after: <segundos>`.

Encerre o dev server com Ctrl+C. Reinicie-o antes de seguir, para zerar o contador em memória.

- [ ] **Step 12: Rodar a suíte inteira**

```bash
npm test
```

Esperado: PASS, 49 testes.

- [ ] **Step 13: Commit**

```bash
git add src/backend/security/ src/start.ts
git commit -m "Adiciona rate-limit por IP com store trocável"
```

---

## Task 5: Proteção contra CSRF

`SameSite=Lax` no cookie — que chega no plano 2.2 — cobre a maior parte. O que ele não cobre: server functions com `FormData` são "requisição simples", não disparam preflight, e um site de terceiro consegue dispará-las com os cookies da vítima.

**Não há middleware para escrever.** O TanStack Start exporta `createCsrfMiddleware` de `@tanstack/react-start` com a semântica exata que a spec pede: valida `Origin`, aceita `Sec-Fetch-Site` com padrão `same-origin`, usa `Referer` como alternativa, responde 403 e — o padrão que importa — rejeita requisição sem nenhum dos três cabeçalhos (`allowRequestsWithoutOriginCheck` é `false` por padrão).

O middleware entra agora, antes de existir o primeiro cookie que ele protege, para não ficar como pendência quando a sessão chegar.

**Files:**
- Modify: `src/start.ts`

- [ ] **Step 1: Registrar o middleware**

Em `src/start.ts`, acrescente `createCsrfMiddleware` ao import do topo:

```ts
import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";
```

Antes do `export const startInstance`, acrescente:

```ts
// Middleware do próprio framework. Valida Origin, com Sec-Fetch-Site e Referer como
// alternativas, e responde 403. Requisição sem nenhum dos três é rejeitada por padrão.
const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

const csrfMiddleware = createCsrfMiddleware({
  // Métodos idempotentes não alteram estado; validá-los quebraria navegação normal
  // vinda de link externo.
  filter: ({ request }) => !METODOS_SEGUROS.has(request.method),
  // Comparador em vez de lista literal: `getEnv()` lê `process.env`, que não existe no
  // navegador. Como função, ela só roda quando o middleware valida uma requisição — no
  // servidor. Uma lista `[getEnv().APP_ORIGIN]` seria avaliada ao carregar o módulo,
  // inclusive no bundle do cliente.
  origin: (valor) => valor === getEnv().APP_ORIGIN,
});
```

E acrescente-o à lista, depois do rate-limit:

```ts
export const startInstance = createStart(() => ({
  // errorMiddleware primeiro: sendo o mais externo, ele captura falhas dos demais.
  requestMiddleware: [errorMiddleware, rateLimitMiddleware, csrfMiddleware],
}));
```

- [ ] **Step 2: Verificar que a navegação normal não foi afetada**

```bash
npm run dev
```

Abra `http://localhost:3000/` e navegue por três páginas. Esperado: tudo funciona. Requisições `GET` não passam pelo filtro.

- [ ] **Step 3: Verificar que mutação com origem estrangeira é recusada**

Com o dev server rodando, em outro terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Origin: https://site-malicioso.exemplo" \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:3000/
```

Esperado: `403`.

- [ ] **Step 4: Verificar o vetor que realmente importa — `FormData` sem preflight**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Origin: https://site-malicioso.exemplo" \
  -F "campo=valor" \
  http://localhost:3000/
```

Esperado: `403`. Este é o caso que `SameSite` sozinho não fecharia.

- [ ] **Step 5: Verificar que mutação da própria origem passa**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:3000/
```

Esperado: **não** é `403`. Um `404` ou `405` aqui é sucesso — significa que o CSRF deixou passar e a rota é que não aceita POST.

- [ ] **Step 6: Verificar o preview do Lovable**

Abra o projeto no editor do Lovable e confirme que o preview renderiza e que navegar entre páginas funciona.

Um iframe tem origem própria: requisições do app para ele mesmo continuam sendo `same-origin`, então o esperado é que nada quebre.

Se quebrar, amplie o comparador de origem — e **apenas fora de produção**:

```ts
origin: (valor) => {
  const env = getEnv();
  if (valor === env.APP_ORIGIN) return true;
  // Exceção só para o preview do Lovable, que roda em iframe de outro domínio.
  return env.NODE_ENV !== "production" && valor.endsWith(".lovable.app");
},
```

Encerre o dev server com Ctrl+C.

- [ ] **Step 7: Rodar a suíte inteira**

```bash
npm test
```

Esperado: PASS, 49 testes. Nenhum teste novo — a lógica é do framework; o que este plano verifica é a fiação, e isso foi feito nos Steps 3 a 5.

- [ ] **Step 8: Commit**

```bash
git add src/start.ts
git commit -m "Ativa a proteção contra CSRF do framework"
```

---

## Task 6: Documentar a configuração no README

Sem isto, quem clonar o repositório copia `.env.example` e o servidor recusa subir por causa de variáveis que ninguém explicou.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Acrescentar a seção de variáveis**

Em `README.md`, logo depois da tabela `### Comandos`, acrescente:

````markdown
### Variáveis de ambiente

Todas são validadas no arranque. Faltando uma obrigatória, o servidor recusa subir e diz qual.

| Variável | Obrigatória | O que é |
| --- | --- | --- |
| `DATABASE_URL` | sempre | Banco de desenvolvimento |
| `TEST_DATABASE_URL` | para rodar testes | Banco de teste. É truncado entre casos — nunca aponte para o de desenvolvimento |
| `APP_ORIGIN` | sempre | Origem pública do app. Usada pela verificação de CSRF |
| `TRUSTED_PROXY_HEADER` | só em produção | Header em que o proxy escreve o IP real do cliente, ex.: `x-forwarded-for` |
| `NODE_ENV` | não | `development` quando ausente |

`TRUSTED_PROXY_HEADER` é obrigatória em produção porque o rate-limit é por IP: sem um proxy
confiável declarado, o IP vem de um header que qualquer cliente forja, e limitar por ele não
limita nada.

### Segurança

O que já está em pé, e onde mexer:

| Proteção | Onde |
| --- | --- |
| Headers de segurança | `src/backend/http/security-headers.ts`, aplicados em `src/backend/ssr/application.ts` |
| Rate-limit por IP | `src/backend/security/rate-limit.ts`, registrado em `src/start.ts` |
| CSRF | `createCsrfMiddleware` do framework, registrado em `src/start.ts` |

**CORS não é usado, de propósito.** O app é same-origin: o SSR serve a interface e as server
functions na mesma origem, e sem cabeçalho CORS nenhum o navegador já impede que outro site
leia as respostas. Acrescentar CORS só afrouxaria isso. A justificativa completa está em
`docs/superpowers/specs/2026-08-04-identidade-e-acesso-design.md`.

A CSP está em **modo relatório**. Violações aparecem no console do navegador sem bloquear
nada. Torná-la bloqueante exige nonce nos scripts de hidratação do TanStack Start.
````

- [ ] **Step 2: Verificar as instruções do zero**

```bash
npm test
npm run build
```

Esperado: 49 testes passam; o build gera `.output/server/index.mjs`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Documenta variáveis de ambiente e proteções ativas"
```

---

## Critérios de conclusão deste plano

1. `npm test` passa com 49 testes.
2. `npm run build` gera `.output/server/index.mjs` — artefato do preset `node-server`.
3. `curl -I http://localhost:3000/` mostra `nosniff`, `Referrer-Policy`, `Permissions-Policy` e a CSP em modo relatório.
4. `Strict-Transport-Security` e `X-Frame-Options` ausentes em desenvolvimento.
5. Subir o servidor sem `APP_ORIGIN` falha nomeando a variável.
6. 320 requisições seguidas produzem respostas `429` com `Retry-After`.
7. POST com `Origin` estrangeiro devolve `403`, inclusive via `FormData`.
8. Navegação normal e preview do Lovable funcionam sem 429 e sem 403.
9. `git status --short` não lista `.env` nem `src/generated/`.

## Próximo plano

`1.2` — fatia vertical de Tarefas: repositório, server functions, boundary de estado e o Kanban lendo do banco. É ele que estabelece o padrão de camadas ao qual o middleware de autenticação vai se acoplar no plano `2.2`.
