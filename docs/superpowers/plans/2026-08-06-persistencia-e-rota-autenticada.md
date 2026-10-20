# Persistência de sessão e rota autenticada — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer com que uma sessão válida sobreviva além da metade do TTL, que a aplicação recuse renderizar sem sessão, e que nenhuma tela exiba dados que não vieram do banco.

**Architecture:** A renovação de sessão passa de troca de token para expiração deslizante, eliminando a revogação que deslogava o usuário. Uma rota de layout `_authed` ganha `beforeLoad` (redireciona sem sessão) e `loader` (hidrata o store antes de renderizar), o que permite remover as constantes de seed do store e tratar `profile` como garantido dentro da área autenticada.

**Tech Stack:** TypeScript, TanStack Start/Router, Prisma 7 + PostgreSQL, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-persistencia-e-rota-autenticada-design.md`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
| --- | --- | --- |
| `src/backend/auth/session.ts` | Ciclo de vida da sessão | Modificar `readSession` |
| `src/backend/auth/session.test.ts` | Testes de sessão | Acrescentar casos |
| `src/backend/functions/session.ts` | Server function `me()`, pública | Criar |
| `src/backend/functions/session.test.ts` | Teste de `me()` | Criar |
| `src/frontend/state/use-profile.ts` | Hook que declara o invariante "há perfil" | Criar |
| `src/routes/_authed.tsx` | Guarda de navegação + hidratação | Criar |
| `src/routes/_authed.*.tsx` | Rotas protegidas | Renomear (15 arquivos) |
| `src/routes/login.tsx` | Login | Modificar (redirect) |
| `src/lib/store.ts` | Estado da aplicação | Modificar (remover seeds) |
| `src/components/app-shell.tsx` | Casca | Modificar (não busca mais) |
| `src/backend/functions/protecao.test.ts` | Teste enumerador | Criar |
| `eslint.config.js` | Regra de fronteira do store | Modificar |

---

### Task 1: Expiração deslizante da sessão

**Files:**
- Modify: `src/backend/auth/session.ts:35-57`
- Test: `src/backend/auth/session.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar dentro do `describe("session", ...)` em `src/backend/auth/session.test.ts`:

```ts
  it("renova sem trocar o token quando passa da metade do TTL", async () => {
    const created = await createSession(userId);
    const vinteDiasAtras = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    await prisma.session.update({
      where: { id: created.session.id },
      data: { createdAt: vinteDiasAtras },
    });

    const lida = await readSession(created.token);

    expect(lida).not.toBeNull();
    expect(lida!.token).toBe(created.token);
    expect(lida!.session.expiresAt.getTime()).toBeGreaterThan(
      created.session.expiresAt.getTime(),
    );
    expect(await prisma.session.count({ where: { userId, revokedAt: null } })).toBe(1);
  });

  it("aceita duas leituras concorrentes da mesma sessão renovada", async () => {
    const created = await createSession(userId);
    await prisma.session.update({
      where: { id: created.session.id },
      data: { createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) },
    });

    const [a, b] = await Promise.all([
      readSession(created.token),
      readSession(created.token),
    ]);

    expect(a?.user.id).toBe(userId);
    expect(b?.user.id).toBe(userId);
  });

  it("continua recusando sessão revogada e sessão expirada", async () => {
    const revogada = await createSession(userId);
    await revokeSession(revogada.token);
    expect(await readSession(revogada.token)).toBeNull();

    const expirada = await createSession(userId);
    await prisma.session.update({
      where: { id: expirada.session.id },
      data: { expiresAt: new Date(0) },
    });
    expect(await readSession(expirada.token)).toBeNull();
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/backend/auth/session.test.ts`
Expected: FAIL — "renova sem trocar o token" falha porque `lida.token` é diferente de `created.token`, e a contagem de sessões ativas dá 1 mas a original foi revogada.

- [ ] **Step 3: Implementar**

Substituir o corpo de `readSession` em `src/backend/auth/session.ts` (linhas 35-57) por:

```ts
export async function readSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;

  const now = new Date();
  const halfway = session.createdAt.getTime() + SESSION_TTL_MS / 2;

  // Renovação deslizante sem trocar o token. Emitir token novo aqui revogaria o que o
  // navegador tem em mãos, e as requisições paralelas já em voo com o token antigo
  // receberiam 401. A rotação continua no login, que é onde ela defende contra fixação.
  const updated =
    now.getTime() >= halfway
      ? await prisma.session.update({
          where: { id: session.id },
          data: { lastUsedAt: now, expiresAt: expiresAt() },
        })
      : await prisma.session.update({
          where: { id: session.id },
          data: { lastUsedAt: now },
        });

  return { token, session: updated, user: session.user };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/backend/auth/session.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS. O teste "rotaciona e revoga o token anterior" continua passando porque `rotateSession` não mudou.

- [ ] **Step 6: Commit**

```bash
git add src/backend/auth/session.ts src/backend/auth/session.test.ts
git commit -m "fix: renovar sessao por expiracao deslizante em vez de trocar o token"
```

---

### Task 2: Server function `me()`

**Files:**
- Create: `src/backend/functions/session.ts`
- Test: `src/backend/functions/session.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/backend/functions/session.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { resetDatabase } from "@/backend/db/testing";
import { readCurrentUser } from "@/backend/functions/session";
import { createSession } from "@/backend/auth/session";
import { seed } from "../../../prisma/seed";

describe("readCurrentUser", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDatabase();
    const seeded = await seed();
    userId = seeded.users.voce.id;
  });

  it("devolve não autenticado quando não há token, sem lançar", async () => {
    await expect(readCurrentUser(undefined)).resolves.toEqual({ authenticated: false });
  });

  it("devolve não autenticado quando o token não existe", async () => {
    await expect(readCurrentUser("token-que-nao-existe")).resolves.toEqual({
      authenticated: false,
    });
  });

  it("devolve autenticado com o id do usuário quando o token é válido", async () => {
    const { token } = await createSession(userId);
    await expect(readCurrentUser(token)).resolves.toEqual({ authenticated: true, userId });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/backend/functions/session.test.ts`
Expected: FAIL — "Cannot find module '@/backend/functions/session'".

- [ ] **Step 3: Implementar**

Criar `src/backend/functions/session.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";

import { readSessionCookie } from "@/backend/auth/cookie";
import { readSession } from "@/backend/auth/session";

export type CurrentUser = { authenticated: false } | { authenticated: true; userId: string };

/**
 * Núcleo testável de `me`. Recebe o token em vez de ler o cookie para poder ser
 * exercitado fora de uma requisição.
 */
export async function readCurrentUser(token: string | undefined): Promise<CurrentUser> {
  if (!token) return { authenticated: false };
  const session = await readSession(token);
  if (!session) return { authenticated: false };
  return { authenticated: true, userId: session.user.id };
}

/**
 * Pública de propósito: precisa responder "não autenticado" em vez de lançar 401, senão
 * a guarda de navegação não distingue ausência de sessão de erro de rede.
 */
export const me = createServerFn({ method: "GET" }).handler(async () =>
  readCurrentUser(readSessionCookie()),
);
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/backend/functions/session.test.ts`
Expected: PASS — 3 testes.

- [ ] **Step 5: Commit**

```bash
git add src/backend/functions/session.ts src/backend/functions/session.test.ts
git commit -m "feat: server function me() para a guarda de navegacao"
```

---

### Task 3: Hook `useProfile`

**Files:**
- Create: `src/frontend/state/use-profile.ts`

- [ ] **Step 1: Implementar**

Criar `src/frontend/state/use-profile.ts`:

```ts
import { useStore } from "@/lib/store";
import type { Profile } from "@/shared/domain/models";

/**
 * Lê o perfil dentro da área autenticada, onde o `loader` de `_authed` já hidratou o
 * store. Lançar em vez de devolver `null` mantém o invariante num lugar só: sem isso,
 * cinco componentes precisariam de `profile?.` e um perfil ausente viraria tela vazia
 * silenciosa em vez de erro.
 */
export function useProfile(): Profile {
  const profile = useStore((s) => s.profile);
  if (!profile) {
    throw new Error(
      "useProfile foi chamado fora da rota _authed, ou antes de o loader hidratar o store.",
    );
  }
  return profile;
}
```

- [ ] **Step 2: Exportar pela fronteira de estado**

Acrescentar a `src/frontend/state/workspace-store.ts`:

```ts
export { useProfile } from "@/frontend/state/use-profile";
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: os mesmos erros pré-existentes de `app-shell.tsx` e `task-dialog.tsx`, e nenhum erro novo mencionando `use-profile`.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/state/use-profile.ts src/frontend/state/workspace-store.ts
git commit -m "feat: hook useProfile declarando o invariante de perfil carregado"
```

---

### Task 4: Rota de layout `_authed`

**Files:**
- Create: `src/routes/_authed.tsx`

- [ ] **Step 1: Implementar**

Criar `src/routes/_authed.tsx`:

```tsx
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getBoardData } from "@/backend/functions/board";
import { me } from "@/backend/functions/session";
import { useStore } from "@/frontend/state/workspace-store";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location }) => {
    const atual = await me();
    if (!atual.authenticated) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  // O loader bloqueia a renderização dos filhos até os dados chegarem. É o que garante
  // que nenhuma tela apareça antes de haver perfil, sem precisar de flag de hidratação.
  loader: async () => {
    const data = await getBoardData();
    useStore.getState().hydrateFromServer(data);
    return null;
  },
  component: () => <Outlet />,
});
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/_authed.tsx
git commit -m "feat: rota de layout _authed com guarda e hidratacao no loader"
```

---

### Task 5: Mover as rotas protegidas para dentro de `_authed`

**Files:**
- Rename: 12 arquivos em `src/routes/`

- [ ] **Step 1: Renomear**

```bash
cd src/routes
git mv index.tsx _authed.index.tsx
git mv inbox.tsx _authed.inbox.tsx
git mv calendar.tsx _authed.calendar.tsx
git mv profile.tsx _authed.profile.tsx
git mv workspace.\$workspaceId.tsx _authed.workspace.\$workspaceId.tsx
git mv workspace.\$workspaceId.index.tsx _authed.workspace.\$workspaceId.index.tsx
git mv workspace.\$workspaceId.docs.tsx _authed.workspace.\$workspaceId.docs.tsx
git mv workspace.\$workspaceId.sprints.tsx _authed.workspace.\$workspaceId.sprints.tsx
git mv workspace.\$workspaceId.goals.tsx _authed.workspace.\$workspaceId.goals.tsx
git mv workspace.\$workspaceId.fields.tsx _authed.workspace.\$workspaceId.fields.tsx
git mv workspace.\$workspaceId.labels.tsx _authed.workspace.\$workspaceId.labels.tsx
git mv workspace.\$workspaceId.team.tsx _authed.workspace.\$workspaceId.team.tsx
git mv workspace.\$workspaceId.workload.tsx _authed.workspace.\$workspaceId.workload.tsx
git mv workspace.\$workspaceId.automations.tsx _authed.workspace.\$workspaceId.automations.tsx
git mv workspace.\$workspaceId.integrations.tsx _authed.workspace.\$workspaceId.integrations.tsx
cd ../..
```

- [ ] **Step 2: Atualizar as chamadas de `createFileRoute` em cada arquivo**

Em cada arquivo renomeado, o primeiro argumento de `createFileRoute` ganha o prefixo
`/_authed`. A lista completa, para não depender de inferência:

| Arquivo | Argumento novo |
| --- | --- |
| `_authed.index.tsx` | `"/_authed/"` |
| `_authed.inbox.tsx` | `"/_authed/inbox"` |
| `_authed.calendar.tsx` | `"/_authed/calendar"` |
| `_authed.profile.tsx` | `"/_authed/profile"` |
| `_authed.workspace.$workspaceId.tsx` | `"/_authed/workspace/$workspaceId"` |
| `_authed.workspace.$workspaceId.index.tsx` | `"/_authed/workspace/$workspaceId/"` |
| `_authed.workspace.$workspaceId.docs.tsx` | `"/_authed/workspace/$workspaceId/docs"` |
| `_authed.workspace.$workspaceId.sprints.tsx` | `"/_authed/workspace/$workspaceId/sprints"` |
| `_authed.workspace.$workspaceId.goals.tsx` | `"/_authed/workspace/$workspaceId/goals"` |
| `_authed.workspace.$workspaceId.fields.tsx` | `"/_authed/workspace/$workspaceId/fields"` |
| `_authed.workspace.$workspaceId.labels.tsx` | `"/_authed/workspace/$workspaceId/labels"` |
| `_authed.workspace.$workspaceId.team.tsx` | `"/_authed/workspace/$workspaceId/team"` |
| `_authed.workspace.$workspaceId.workload.tsx` | `"/_authed/workspace/$workspaceId/workload"` |
| `_authed.workspace.$workspaceId.automations.tsx` | `"/_authed/workspace/$workspaceId/automations"` |
| `_authed.workspace.$workspaceId.integrations.tsx` | `"/_authed/workspace/$workspaceId/integrations"` |

Os caminhos de URL **não mudam**: `_authed` é segmento de layout e não aparece na barra de
endereço. Nenhum `<Link to=...>` precisa ser tocado.

- [ ] **Step 3: Regenerar a árvore de rotas e verificar**

Run: `npx vite build --mode development`
Expected: build passa. `src/routeTree.gen.ts` é regenerado com as rotas sob `_authed`.

- [ ] **Step 4: Commit**

```bash
git add -A src/routes src/routeTree.gen.ts
git commit -m "refactor: mover rotas protegidas para dentro de _authed"
```

---

### Task 6: Login honra `redirect` e recusa sessão ativa

**Files:**
- Modify: `src/routes/login.tsx:10-32`

- [ ] **Step 1: Implementar**

Substituir a declaração da rota e o início do componente em `src/routes/login.tsx`:

```tsx
import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { signIn } from "@/backend/functions/auth";
import { me } from "@/backend/functions/session";

const busca = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/login")({
  validateSearch: busca,
  beforeLoad: async ({ search }) => {
    const atual = await me();
    if (atual.authenticated) {
      throw redirect({ to: search.redirect ?? "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect: destino } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signIn({ data: { email, password } });
      if (!result.ok) setError(result.message);
      else await navigate({ to: destino ?? "/" });
    } catch {
      setError("Não foi possível entrar agora.");
    } finally {
      setLoading(false);
    }
  }
```

O resto do arquivo (o JSX e os componentes `Field` e `AuthCard`) não muda.

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo em `login.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/login.tsx
git commit -m "feat: login redireciona para a origem e recusa sessao ja ativa"
```

---

### Task 7: Esvaziar o estado inicial do store

**Files:**
- Modify: `src/lib/store.ts` — remover linhas 172-380 (seeds) e 1641-1701 (persist comentado), alterar 487-499

- [ ] **Step 1: Trocar o estado inicial**

Em `src/lib/store.ts`, substituir as linhas 487-499:

```ts
export const useStore = create<Store>()((set, get) => ({
  workspaces: [],
  tasks: [],
  profile: null,
  integrations: {},
  hydrateFromServer: (data) => {
    set({
      workspaces: data.workspaces,
      tasks: data.tasks,
      profile: data.profile,
    });
  },
```

A linha que removia `flow-tasks-store` do `localStorage` sai junto: o `persist` já não existe,
então não há nada para limpar.

- [ ] **Step 2: Atualizar o tipo de `profile` na interface `Store`**

Localizar a declaração `profile: Profile;` na interface `Store` e trocar por:

```ts
  profile: Profile | null;
```

- [ ] **Step 3: Apagar as constantes de seed**

Remover de `src/lib/store.ts`: `seedMembersAcme`, `seedMembersPersonal`, `seedWorkspaces`,
`seedTasks` e `defaultProfile`, com todo o conteúdo delas (aproximadamente as linhas 172-380 e
384-395). Remover também o bloco comentado do `persist` no fim do arquivo (linhas 1641-1701),
deixando o objeto do `create` fechando com `}));`.

- [ ] **Step 4: Verificar que o compilador aponta os consumidores**

Run: `npx tsc --noEmit`
Expected: erros novos em `app-shell.tsx`, `task-dialog.tsx`, `inbox.tsx`, `index.tsx` e
`profile.tsx`, todos da forma "'profile' is possibly 'null'". São os cinco que a Task 8 corrige.

- [ ] **Step 5: Não commitar ainda**

O repositório não compila entre esta task e a próxima. Task 7 e Task 8 formam um commit só,
feito ao fim da Task 8.

---

### Task 8: Migrar os cinco consumidores para `useProfile`

**Files:**
- Modify: `src/components/app-shell.tsx:58`, `:324`
- Modify: `src/components/task-dialog.tsx:99`
- Modify: `src/routes/_authed.inbox.tsx:26`
- Modify: `src/routes/_authed.index.tsx:45`
- Modify: `src/routes/_authed.profile.tsx:24`

- [ ] **Step 1: `app-shell.tsx`**

Trocar a linha 58:

```tsx
  const profile = useProfile();
```

Trocar a linha 324:

```tsx
  const pinnedWorkspaces = useStore((s) => s.profile?.pinnedWorkspaces);
  const pinned = wsId ? (pinnedWorkspaces?.includes(wsId) ?? false) : false;
```

Acrescentar `useProfile` ao import existente de `@/frontend/state/workspace-store`.

Remover o `useEffect` de hidratação (linhas 65-79) e as declarações que só ele usava
(`loadBoard` na linha 63), mais os imports de `getBoardData` e `useServerFn` se não houver
outro uso. O `loader` de `_authed` passou a fazer esse trabalho.

- [ ] **Step 2: `task-dialog.tsx`**

Trocar a linha 99:

```tsx
  const profileName = useProfile().name;
```

Acrescentar `useProfile` ao import de `@/frontend/state/workspace-store`.

- [ ] **Step 3: `_authed.inbox.tsx`, `_authed.index.tsx` e `_authed.profile.tsx`**

Em cada um, trocar `const profile = useStore((s) => s.profile);` por:

```tsx
  const profile = useProfile();
```

E acrescentar `useProfile` ao import de `@/frontend/state/workspace-store`.

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: voltam apenas os erros pré-existentes de `app-shell.tsx` (uso de `useRouterState`) e
`task-dialog.tsx:640`. Nenhum erro de `profile` possivelmente nulo.

- [ ] **Step 5: Rodar a suíte**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.ts src/components src/routes
git commit -m "refactor: remover dados-semente do store e ler perfil por useProfile"
```

---

### Task 9: Corrigir o formulário de perfil

**Files:**
- Modify: `src/routes/_authed.profile.tsx:23-32`, e o texto na linha 61

- [ ] **Step 1: Separar o formulário num componente com chave**

Em `src/routes/_authed.profile.tsx`, o componente da página passa a delegar o formulário,
passando `key`. Substituir a assinatura de `ProfilePage` e o início do corpo:

```tsx
function ProfilePage() {
  const profile = useProfile();
  // A chave remonta o formulário se o perfil trocar. Sem ela, os useState abaixo
  // guardariam para sempre os valores da primeira montagem — que foi o defeito que
  // permitia gravar dados obsoletos por cima do perfil real.
  return <ProfileForm key={profile.email} profile={profile} />;
}

function ProfileForm({ profile }: { profile: Profile }) {
  const updateProfile = useStore((s) => s.updateProfile);

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [role, setRole] = useState(profile.role);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [color, setColor] = useState(profile.avatarColor);
  const [saved, setSaved] = useState(false);
```

O resto do corpo original de `ProfilePage` (o `useEffect` do toast, a função `save` e todo o
JSX) passa para `ProfileForm` sem alteração. Acrescentar o import do tipo:

```tsx
import type { Profile } from "@/frontend/state/workspace-store";
```

- [ ] **Step 2: Corrigir o texto obsoleto**

Trocar o texto da linha 61 (agora dentro de `ProfileForm`):

```tsx
            Personalize como você aparece no Flow.
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authed.profile.tsx
git commit -m "fix: formulario de perfil deixa de gravar dados obsoletos"
```

---

### Task 10: Teste enumerador de proteção

**Files:**
- Create: `src/backend/functions/protecao.test.ts`

- [ ] **Step 1: Escrever o teste**

Criar `src/backend/functions/protecao.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PASTA = "src/backend/functions";

// Funções deliberadamente públicas. Tornar outra pública exige editar esta lista, que é
// o ponto: a exposição passa a ser uma decisão registrada, não um esquecimento.
const PUBLICAS = new Set([
  "signUp", // cadastro é aberto
  "signIn", // quem entra ainda não tem sessão
  "signOut", // precisa funcionar mesmo com sessão já inválida
  "me", // responde "não autenticado" em vez de lançar
  "readInvite", // quem aceita convite ainda não tem conta
  "acceptInvite",
]);

/** Extrai `export const <nome> = createServerFn(` de um módulo. */
function serverFunctionsDe(fonte: string): string[] {
  const encontradas: string[] = [];
  const padrao = /export const (\w+)\s*=\s*createServerFn\(/g;
  let m: RegExpExecArray | null;
  while ((m = padrao.exec(fonte)) !== null) encontradas.push(m[1]);
  return encontradas;
}

/** O trecho da declaração de uma função até a próxima, para procurar o middleware nela. */
function trechoDa(fonte: string, nome: string): string {
  const inicio = fonte.indexOf(`export const ${nome} =`);
  const proxima = fonte.indexOf("\nexport const ", inicio + 1);
  return fonte.slice(inicio, proxima === -1 ? undefined : proxima);
}

describe("proteção das server functions", () => {
  const arquivos = readdirSync(PASTA).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
  );

  it("encontra os módulos de server function", () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  for (const arquivo of arquivos) {
    const fonte = readFileSync(join(PASTA, arquivo), "utf8");
    for (const nome of serverFunctionsDe(fonte)) {
      if (PUBLICAS.has(nome)) continue;

      it(`${arquivo}: ${nome} exige sessão`, () => {
        expect(trechoDa(fonte, nome)).toContain("middleware([requireSession])");
      });
    }
  }
});
```

- [ ] **Step 2: Rodar e confirmar que passa**

Run: `npx vitest run src/backend/functions/protecao.test.ts`
Expected: PASS. Todas as funções não listadas em `PUBLICAS` têm o middleware, porque foram
inlinadas nos commits `4300cdb` e `492ff9b`.

- [ ] **Step 3: Confirmar que o teste realmente detecta a falha**

Remover temporariamente `.middleware([requireSession])` de `createWorkspace` em
`src/backend/functions/workspace.ts` e rodar de novo.

Run: `npx vitest run src/backend/functions/protecao.test.ts`
Expected: FAIL — "workspace.ts: createWorkspace exige sessão".

Desfazer a remoção:

```bash
git checkout src/backend/functions/workspace.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/backend/functions/protecao.test.ts
git commit -m "test: falhar quando uma server function perde requireSession"
```

---

### Task 11: Regra de ESLint para a fronteira do store

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Acrescentar a regra**

Adicionar ao array exportado em `eslint.config.js`, depois da configuração existente:

```js
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/frontend/state/**", "src/lib/store.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/store",
              message:
                "Importe de @/frontend/state/workspace-store. O store é detalhe de implementação " +
                "atrás dessa fronteira.",
            },
          ],
        },
      ],
    },
  },
```

- [ ] **Step 2: Rodar o lint**

Run: `npx eslint .`
Expected: erros nos arquivos que importam `@/lib/store` diretamente — entre eles
`src/routes/_authed.tsx` e `src/routes/_authed.profile.tsx`, criados neste plano.

- [ ] **Step 3: Corrigir os importadores**

Exportar o que falta em `src/frontend/state/workspace-store.ts`:

```ts
export { useStore } from "@/lib/store";
```

Já existe. Para `_authed.tsx` e `_authed.profile.tsx`, trocar
`import { useStore } from "@/lib/store"` por
`import { useStore } from "@/frontend/state/workspace-store"`.

Corrigir do mesmo modo qualquer outro arquivo apontado pelo lint.

- [ ] **Step 4: Rodar o lint de novo**

Run: `npx eslint .`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js src
git commit -m "chore: proibir import direto de @/lib/store fora da fronteira de estado"
```

---

### Task 12: Verificação ponta a ponta

**Files:** nenhum — verificação manual contra os critérios de aceite da spec.

- [ ] **Step 1: Suíte e tipos**

```bash
npx vitest run
npx tsc --noEmit
npx eslint .
```

Expected: testes passam; `tsc` mostra apenas os erros pré-existentes de `app-shell.tsx` e
`task-dialog.tsx`; lint limpo.

- [ ] **Step 2: Subir a aplicação**

```bash
docker compose up -d
npx vite dev --port 3000 --strictPort
```

A porta 3000 é obrigatória: o CSRF em `src/start.ts:63` compara com `APP_ORIGIN`.

- [ ] **Step 3: Verificar a guarda, deslogado**

Num navegador sem cookie de sessão, abrir `http://localhost:3000/profile`.

Expected: redireciona para `/login?redirect=...`. Nenhum nome de workspace, nenhum
"voce@flow.app" e nenhum "Acme Inc." aparece em momento nenhum.

- [ ] **Step 4: Verificar o retorno à origem**

Entrar com uma conta válida a partir da tela acima.

Expected: cai em `/profile`, não em `/`.

- [ ] **Step 5: Verificar o perfil**

Na tela de perfil, conferir que os campos mostram os dados da conta autenticada. Salvar sem
alterar nada e recarregar.

Expected: os dados continuam os da conta. Nada virou "Você" nem "voce@flow.app".

- [ ] **Step 6: Verificar a sessão renovada**

Envelhecer a sessão no banco e recarregar a aplicação:

```bash
docker exec flow-postgres psql -U flow -d flow_dev -c \
  "update \"Session\" set \"createdAt\" = now() - interval '20 days' where \"revokedAt\" is null;"
```

Expected: a aplicação continua funcionando, sem deslogar. Conferir que o token não trocou:

```bash
docker exec flow-postgres psql -U flow -d flow_dev -c \
  "select count(*) from \"Session\" where \"revokedAt\" is null;"
```

Expected: a mesma contagem de antes do envelhecimento.

- [ ] **Step 7: Commit final**

```bash
git add -A
git commit -m "docs: plano de persistencia e rota autenticada concluido"
```
