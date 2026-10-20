# Fundação de dados — Infra, Schema e Seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o banco PostgreSQL do Flow com as 23 tabelas do domínio e populá-lo com os dados de exemplo que o app mostra hoje, tudo verificado por testes automatizados.

**Architecture:** PostgreSQL 18 local (já instalado nesta máquina) com dois bancos: `flow_dev` e `flow_test`. Prisma 7 gera o cliente em `src/generated/prisma`, fora de `node_modules`. Um cliente singleton em `src/backend/db/client.ts` evita vazamento de conexões no hot reload do dev server. Os testes rodam em vitest contra `flow_test`, limpando as tabelas entre casos.

**Tech Stack:** PostgreSQL 18.1 · Prisma 7.9 · vitest 4 · tsx 4 · TypeScript 5.8 · Node 22

**Escopo deste plano:** infraestrutura, schema e seed. Repositórios, server functions e a migração do boundary de estado são planos seguintes — este entrega um banco real, migrado, populado e testado.

**Spec:** `docs/superpowers/specs/2026-08-02-fundacao-de-dados-design.md`

---

## Ambiente já verificado

Confirmado nesta máquina antes de escrever o plano — não precisa reverificar:

| Item | Estado |
| --- | --- |
| Docker | 29.6.2, daemon rodando. CLI em `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe` — **não** em `Program Files` |
| PostgreSQL nativo | 18.1 instalado e ocupando a 5432. **Inutilizável**: a senha do superusuário não é conhecida e o `pg_hba.conf` exige `scram-sha-256` em todas as linhas |
| Porta do contêiner | **5433**, para conviver com a instalação nativa |
| Node / npm | v22.18.0 / 10.9.3 |
| bun | **não instalado** — use `npm`, apesar do `bun.lock` no repositório |
| Alias `@/*` | mapeado para `./src/*` em `tsconfig.json` |

O banco vive num contêiner justamente para não depender de nenhuma senha externa: as
credenciais são definidas em `docker-compose.yml` e valem só para desenvolvimento local.

## File Structure

| Arquivo | Responsabilidade |
| --- | --- |
| `.env` | Segredos locais. **Nunca versionado** |
| `.env.example` | Documenta as variáveis, com valores de exemplo |
| `.gitignore` | Modificado: passa a ignorar `.env` e `src/generated/` |
| `prisma.config.ts` | Configuração do CLI do Prisma 7: caminho do schema, migrations, seed |
| `prisma/schema.prisma` | As 23 tabelas e 5 enums. Fonte da verdade do banco |
| `prisma/seed.ts` | Popula `flow_dev` com Acme Inc. e Projetos pessoais |
| `src/backend/db/client.ts` | Cliente Prisma singleton |
| `src/backend/db/client.test.ts` | Prova que a conexão funciona |
| `src/backend/db/testing.ts` | Limpeza de tabelas entre testes |
| `prisma/seed.test.ts` | Verifica o resultado do seed |
| `vitest.config.ts` | Configuração dos testes: ambiente node, alias `@/` |
| `package.json` | Modificado: dependências e scripts `test`, `db:*` |

---

## Task 1: Subir o PostgreSQL em contêiner

O banco vive num contêiner e não na instalação nativa da máquina. Duas razões: a senha do
superusuário nativo não é conhecida e o `pg_hba.conf` exige `scram-sha-256` em todas as
linhas, sem brecha de `trust`; e iniciar um serviço do Windows exige elevação, que uma
sessão comum não tem. No contêiner as credenciais são definidas pela configuração.

**Files:**
- Create: `docker-compose.yml`
- Create: `docker/init/01-cria-banco-de-teste.sql`

- [ ] **Step 1: Criar `docker-compose.yml`**

O mount vai em `/var/lib/postgresql` e **não** em `/var/lib/postgresql/data`. A imagem 18
guarda os dados num subdiretório por versão maior e recusa subir se encontrar o layout
antigo, com a mensagem "there appears to be PostgreSQL data in: /var/lib/postgresql/data
(unused mount/volume)".

```yaml
services:
  db:
    image: postgres:18-alpine
    container_name: flow-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: flow
      POSTGRES_PASSWORD: flow_dev_local
      POSTGRES_DB: flow_dev
    ports:
      - "5433:5432"
    volumes:
      - flow-pgdata:/var/lib/postgresql
      - ./docker/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U flow -d flow_dev"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  flow-pgdata:
```

A porta externa é **5433**: a 5432 está ocupada pela instalação nativa do PostgreSQL.

- [ ] **Step 2: Criar o script que gera o banco de teste**

`POSTGRES_DB` cria um banco só. Os testes precisam de outro, porque truncam todas as
tabelas entre casos.

`docker/init/01-cria-banco-de-teste.sql`:

```sql
CREATE DATABASE flow_test OWNER flow;
```

Este script roda uma única vez, na criação do volume. Se o volume já existir, ele é
ignorado — use `docker compose down -v` para forçar a recriação.

- [ ] **Step 3: Subir o contêiner**

```bash
docker compose up -d
```

Esperado: `Container flow-postgres Started`.

- [ ] **Step 4: Esperar ficar saudável e conferir os dois bancos**

```bash
docker inspect --format '{{.State.Health.Status}}' flow-postgres
docker exec flow-postgres psql -U flow -d flow_dev -t \
  -c "SELECT datname FROM pg_database WHERE datname LIKE 'flow%' ORDER BY datname;"
```

Esperado: `healthy`, seguido de `flow_dev` e `flow_test`.

Se vier `unhealthy`, rode `docker logs flow-postgres`. O erro mais provável é o do mount
descrito no Step 1; nesse caso corrija o `docker-compose.yml` e recrie com
`docker compose down -v && docker compose up -d`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml docker/
git commit -m "Sobe o Postgres de desenvolvimento em contêiner"
```

---

## Task 2: Instalar Prisma e configurar o projeto

**Files:**
- Create: `.env`
- Create: `.env.example`
- Create: `prisma.config.ts`
- Create: `prisma/schema.prisma`
- Modify: `.gitignore`
- Modify: `package.json`

- [ ] **Step 1: Instalar as dependências**

```bash
npm install --no-package-lock @prisma/client@^7 @prisma/adapter-pg@^7 dotenv@^17
npm install --no-package-lock --save-dev prisma@^7 tsx@^4
```

O `@prisma/adapter-pg` é obrigatório no Prisma 7: o cliente não abre conexão sozinho a
partir de uma URL no schema, ele recebe um driver adapter no construtor.

Use sempre `--no-package-lock`: o projeto versiona `bun.lock` e um `package-lock.json`
concorrente causaria divergência entre as duas fontes.

Esperado: instalação sem erro. Confira com `npx prisma --version` — deve mostrar 7.x.

- [ ] **Step 2: Ignorar `.env` e o cliente gerado**

`.gitignore` hoje **não** ignora `.env`. Sem esta mudança, a senha do banco vai para o
repositório no primeiro commit. Adicione ao final do arquivo:

```gitignore
# Ambiente local
.env

# Cliente Prisma gerado
src/generated/
```

- [ ] **Step 3: Criar `.env` e `.env.example`**

`.env` (não versionado):

```dotenv
DATABASE_URL="postgresql://flow:flow_dev_local@localhost:5432/flow_dev?schema=public"
TEST_DATABASE_URL="postgresql://flow:flow_dev_local@localhost:5432/flow_test?schema=public"
```

`.env.example` (versionado, sem segredo real):

```dotenv
# Banco de desenvolvimento. PostgreSQL 18 local, papel `flow`.
DATABASE_URL="postgresql://flow:SUA_SENHA@localhost:5432/flow_dev?schema=public"

# Banco usado pelos testes. É truncado entre casos — nunca aponte para o de desenvolvimento.
TEST_DATABASE_URL="postgresql://flow:SUA_SENHA@localhost:5432/flow_test?schema=public"
```

- [ ] **Step 4: Criar `prisma.config.ts` na raiz do projeto**

No Prisma 7 este arquivo substitui a chave `prisma` do `package.json`.

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

- [ ] **Step 5: Criar `prisma/schema.prisma` com gerador e datasource**

Só o cabeçalho por enquanto; os modelos entram nas Tasks 3 a 5.

O gerador `prisma-client-js` está descontinuado no Prisma 7. O gerador `prisma-client`
exige `output` explícito e gera TypeScript legível fora de `node_modules`.

O bloco `datasource` **não** leva `url`. O Prisma 7 removeu essa propriedade do schema: o
CLI lê a URL de `prisma.config.ts` e o cliente em runtime recebe um driver adapter.
Escrever `url` aqui falha a validação com o código P1012.

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "esm"
}

// No Prisma 7 o `url` não existe mais aqui: o CLI lê de prisma.config.ts e o cliente
// em runtime recebe um driver adapter no construtor (src/backend/db/client.ts).
datasource db {
  provider = "postgresql"
}
```

- [ ] **Step 6: Adicionar os scripts ao `package.json`**

No objeto `scripts`, junto dos existentes:

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio",
    "db:generate": "prisma generate"
```

- [ ] **Step 7: Validar a configuração**

```bash
npx prisma validate
```

Esperado: `The schema at prisma/schema.prisma is valid 🚀`

Se aparecer o erro P1012 dizendo que `The datasource property 'url' is no longer supported
in schema files`, o bloco `datasource` do Step 5 foi escrito com `url`. Remova essa linha —
`prisma.config.ts` é o único lugar onde a URL fica.

- [ ] **Step 8: Confirmar que `.env` não será commitado**

```bash
git status --short
```

Esperado: `.env` **não** aparece na listagem. Se aparecer, o Step 2 não foi aplicado —
corrija antes de continuar, porque o próximo passo é um commit.

- [ ] **Step 9: Commit**

```bash
git add .gitignore .env.example prisma.config.ts prisma/schema.prisma package.json
git commit -m "Configura Prisma 7 e o banco de desenvolvimento"
```

---

## Task 3: Schema — identidade

**Files:**
- Modify: `prisma/schema.prisma`

`Profile` vira `User`. `Member`, que hoje é só nome e cor, vira `WorkspaceMember` ligando
um usuário real a um workspace. `Session` nasce aqui e só ganha uso no sub-projeto 2.

`WorkspaceMember.title` guarda o cargo livre ("Owner", "Design", "Dev") que hoje mora em
`Member.role`. Permissões reais são um campo separado que chega no sub-projeto 3 — os dois
conceitos não se misturam.

- [ ] **Step 1: Acrescentar os modelos ao final de `prisma/schema.prisma`**

```prisma
model User {
  id                  String    @id @default(uuid())
  name                String
  email               String    @unique
  avatarColor         String
  title               String?
  bio                 String?
  notificationsReadAt DateTime?
  createdAt           DateTime  @default(now())

  sessions         Session[]
  memberships      WorkspaceMember[]
  assignedTasks    Task[]            @relation("TaskAssignee")
  comments         Comment[]
  timeEntries      TimeEntry[]
  activities       Activity[]
  pinnedWorkspaces PinnedWorkspace[]
  pinnedTasks      PinnedTask[]
}

model Session {
  id        String   @id @default(uuid())
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model WorkspaceMember {
  id          String   @id @default(uuid())
  workspaceId String
  userId      String
  title       String?
  createdAt   DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
  @@index([workspaceId])
}
```

- [ ] **Step 2: Verificar que o schema ainda não valida**

```bash
npx prisma validate
```

Esperado: **FALHA** com erro de tipo desconhecido `Workspace`, `Task`, `Comment`,
`TimeEntry`, `Activity`, `PinnedWorkspace`, `PinnedTask`. É o esperado — esses modelos
entram nas Tasks 4 e 5. Não commite ainda.

---

## Task 4: Schema — workspace

**Files:**
- Modify: `prisma/schema.prisma`

Tudo que hoje é vetor aninhado dentro do objeto `Workspace` vira tabela com chave
estrangeira e exclusão em cascata.

`Automation.trigger` e `Automation.action` são uniões discriminadas e ficam como `Json`,
validadas por zod na entrada. Normalizá-las exigiria uma tabela por variante sem ganho de
consulta — elas nunca são filtradas por conteúdo.

`Integration.externalId` guarda o identificador do catálogo (`"slack"`, `"github"`), que
hoje é o campo `id` de `WorkspaceIntegration`.

- [ ] **Step 1: Acrescentar os enums e modelos ao final de `prisma/schema.prisma`**

```prisma
enum SprintStatus {
  planned
  active
  closed
}

enum CustomFieldType {
  text
  number
  select
}

model Workspace {
  id          String   @id @default(uuid())
  name        String
  color       String
  description String?
  createdAt   DateTime @default(now())

  members      WorkspaceMember[]
  labels       Label[]
  sprints      Sprint[]
  customFields CustomField[]
  docs         Doc[]
  goals        Goal[]
  automations  Automation[]
  integrations Integration[]
  tasks        Task[]
  pinnedBy     PinnedWorkspace[]
}

model Label {
  id          String @id @default(uuid())
  workspaceId String
  name        String
  color       String

  workspace Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  tasks     TaskLabel[]

  @@unique([workspaceId, name])
}

model Sprint {
  id          String       @id @default(uuid())
  workspaceId String
  name        String
  goal        String?
  startDate   DateTime?
  endDate     DateTime?
  status      SprintStatus @default(planned)
  createdAt   DateTime     @default(now())

  workspace Workspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  tasks     Task[]
  goals     GoalSprint[]

  @@index([workspaceId])
}

model CustomField {
  id          String          @id @default(uuid())
  workspaceId String
  name        String
  type        CustomFieldType
  options     String[]

  workspace Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  values    TaskFieldValue[]

  @@index([workspaceId])
}

model Doc {
  id          String   @id @default(uuid())
  workspaceId String
  title       String
  body        String   @default("")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
}

model Goal {
  id          String    @id @default(uuid())
  workspaceId String
  name        String
  description String?
  dueDate     DateTime?
  createdAt   DateTime  @default(now())

  workspace Workspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  tasks     GoalTask[]
  sprints   GoalSprint[]

  @@index([workspaceId])
}

model GoalTask {
  goalId String
  taskId String

  goal Goal @relation(fields: [goalId], references: [id], onDelete: Cascade)
  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@id([goalId, taskId])
}

model GoalSprint {
  goalId   String
  sprintId String

  goal   Goal   @relation(fields: [goalId], references: [id], onDelete: Cascade)
  sprint Sprint @relation(fields: [sprintId], references: [id], onDelete: Cascade)

  @@id([goalId, sprintId])
}

model Automation {
  id          String   @id @default(uuid())
  workspaceId String
  name        String
  enabled     Boolean  @default(true)
  trigger     Json
  action      Json
  createdAt   DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
}

model Integration {
  id          String   @id @default(uuid())
  workspaceId String
  externalId  String
  name        String
  category    String
  config      Json?
  connectedAt DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, externalId])
}
```

- [ ] **Step 2: Verificar que o schema ainda não valida**

```bash
npx prisma validate
```

Esperado: **FALHA**, agora só com tipo desconhecido `Task`, `TaskLabel`,
`TaskFieldValue`, `PinnedWorkspace`. Entram na Task 5. Não commite ainda.

---

## Task 5: Schema — tarefa e perfil

**Files:**
- Modify: `prisma/schema.prisma`

Duas correções de modelagem entram aqui:

`Task.labels` é hoje um vetor de **nomes** enquanto `Workspace.labels` guarda objetos com
`id` — por isso renomear uma etiqueta varre todas as tarefas reescrevendo texto
(`src/lib/store.ts:531`). `TaskLabel` liga por `labelId` e renomear vira um `UPDATE` de uma
linha.

`Task` carrega hoje `assignee` (nome) ao lado de `assigneeId`. Fica só a chave estrangeira.

`Subtask.position` preserva a ordem que o vetor garantia implicitamente.

- [ ] **Step 1: Acrescentar os enums e modelos ao final de `prisma/schema.prisma`**

```prisma
enum TaskStatus {
  todo
  in_progress
  done
}

enum TaskPriority {
  low
  medium
  high
}

enum ActivityKind {
  created
  status
  priority
  assignee
  dueDate
  sprint
  subtask
  time
  comment
  field
  dependency
  automation
}

model Task {
  id              String       @id @default(uuid())
  workspaceId     String
  title           String
  description     String?
  status          TaskStatus   @default(todo)
  priority        TaskPriority @default(medium)
  assigneeId      String?
  sprintId        String?
  startDate       DateTime?
  dueDate         DateTime?
  estimateMinutes Int?
  createdAt       DateTime     @default(now())

  workspace   Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  assignee    User?            @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  sprint      Sprint?          @relation(fields: [sprintId], references: [id], onDelete: SetNull)
  labels      TaskLabel[]
  comments    Comment[]
  subtasks    Subtask[]
  timeEntries TimeEntry[]
  fieldValues TaskFieldValue[]
  activities  Activity[]
  blockedBy   TaskBlocker[]    @relation("Blocked")
  blocking    TaskBlocker[]    @relation("Blocker")
  goals       GoalTask[]
  pinnedBy    PinnedTask[]

  @@index([workspaceId])
  @@index([status])
  @@index([assigneeId])
  @@index([sprintId])
}

model TaskLabel {
  taskId  String
  labelId String

  task  Task  @relation(fields: [taskId], references: [id], onDelete: Cascade)
  label Label @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@id([taskId, labelId])
}

model Comment {
  id        String   @id @default(uuid())
  taskId    String
  authorId  String
  text      String
  createdAt DateTime @default(now())

  task   Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author User @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([taskId])
}

model Subtask {
  id       String  @id @default(uuid())
  taskId   String
  title    String
  done     Boolean @default(false)
  position Int

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId])
}

model TimeEntry {
  id        String   @id @default(uuid())
  taskId    String
  authorId  String
  minutes   Int
  note      String?
  createdAt DateTime @default(now())

  task   Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author User @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([taskId])
}

model TaskFieldValue {
  taskId      String
  fieldId     String
  valueText   String?
  valueNumber Float?

  task  Task        @relation(fields: [taskId], references: [id], onDelete: Cascade)
  field CustomField @relation(fields: [fieldId], references: [id], onDelete: Cascade)

  @@id([taskId, fieldId])
}

model Activity {
  id        String       @id @default(uuid())
  taskId    String
  authorId  String
  kind      ActivityKind
  text      String
  createdAt DateTime     @default(now())

  task   Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author User @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([taskId])
}

model TaskBlocker {
  taskId          String
  blockedByTaskId String

  task      Task @relation("Blocked", fields: [taskId], references: [id], onDelete: Cascade)
  blockedBy Task @relation("Blocker", fields: [blockedByTaskId], references: [id], onDelete: Cascade)

  @@id([taskId, blockedByTaskId])
}

model PinnedWorkspace {
  userId      String
  workspaceId String

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@id([userId, workspaceId])
}

model PinnedTask {
  userId String
  taskId String

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@id([userId, taskId])
}
```

- [ ] **Step 2: Validar o schema completo**

```bash
npx prisma validate
```

Esperado: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Conferir a contagem de modelos**

```bash
grep -c "^model " prisma/schema.prisma
```

Esperado: `23`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "Adiciona o schema completo do domínio: 23 tabelas"
```

---

## Task 6: Aplicar a primeira migration

**Files:**
- Create: `prisma/migrations/` (gerado pelo CLI)

- [ ] **Step 1: Gerar e aplicar a migration**

```bash
npx prisma migrate dev --name fundacao_inicial
```

Esperado: cria `prisma/migrations/<timestamp>_fundacao_inicial/migration.sql` e aplica em
`flow_dev`.

Atenção: ao contrário do que acontecia em versões anteriores, `migrate dev` **não** gera o
cliente. Rode em seguida:

```bash
npx prisma generate
```

Esperado: `✔ Generated Prisma Client (7.9.1) to .\src\generated\prisma`. Sem este passo,
os testes da Task 7 falham com `Cannot find package '@/generated/prisma/client'`.

- [ ] **Step 2: Confirmar as 23 tabelas no banco**

```powershell
$env:PGPASSWORD = "flow_dev_local"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U flow -d flow_dev -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> '_prisma_migrations';"
Remove-Item Env:PGPASSWORD
```

Esperado: `23`

- [ ] **Step 3: Aplicar o mesmo schema no banco de teste**

`migrate deploy` aplica as migrations existentes sem tentar criar novas. Rodar no
PowerShell, sobrescrevendo a URL só para este comando:

```powershell
$env:DATABASE_URL = "postgresql://flow:flow_dev_local@localhost:5432/flow_test?schema=public"
npx prisma migrate deploy
Remove-Item Env:DATABASE_URL
```

Esperado: `1 migration found` e `All migrations have been successfully applied.`

- [ ] **Step 4: Confirmar que o cliente gerado não será commitado**

```bash
git status --short
```

Esperado: `src/generated/` **não** aparece. Se aparecer, o Step 2 da Task 2 não foi
aplicado.

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations
git commit -m "Aplica a migration inicial do banco"
```

---

## Task 7: Cliente Prisma singleton, com teste

**Files:**
- Create: `vitest.config.ts`
- Create: `src/backend/db/client.ts`
- Test: `src/backend/db/client.test.ts`

O dev server do Vite recarrega módulos a cada alteração. Sem o singleton, cada recarga cria
um `PrismaClient` novo e as conexões se acumulam até o Postgres recusar novas.

- [ ] **Step 1: Instalar o vitest**

```bash
npm install --no-package-lock --save-dev vitest@^4
```

- [ ] **Step 2: Criar `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "prisma/**/*.test.ts"],
    setupFiles: ["src/backend/db/testing.ts"],
    // Os testes compartilham um único banco; rodar em paralelo faria um caso
    // truncar as tabelas enquanto outro ainda lê.
    fileParallelism: false,
  },
});
```

- [ ] **Step 3: Escrever o teste que falha**

`src/backend/db/client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "@/backend/db/client";

describe("cliente Prisma", () => {
  it("conecta no banco e responde a uma consulta", async () => {
    const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    expect(rows[0].ok).toBe(1);
  });

  it("devolve sempre a mesma instância", async () => {
    const again = await import("@/backend/db/client");
    expect(again.prisma).toBe(prisma);
  });
});
```

- [ ] **Step 4: Criar o arquivo de setup dos testes**

`src/backend/db/testing.ts` — por enquanto só aponta os testes para `flow_test`. A limpeza
de tabelas entra na Task 9.

```ts
import "dotenv/config";

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL não definida. Copie .env.example para .env e preencha as duas URLs.",
  );
}

if (testUrl === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL é igual a DATABASE_URL. Os testes truncam as tabelas — " +
      "apontar para o banco de desenvolvimento apagaria seus dados.",
  );
}

// O cliente lê DATABASE_URL; nos testes ela passa a ser a do banco de teste.
process.env.DATABASE_URL = testUrl;
```

- [ ] **Step 5: Rodar o teste para verificar que falha**

```bash
npm test
```

Esperado: **FALHA** com `Failed to resolve import "@/backend/db/client"`.

- [ ] **Step 6: Escrever a implementação mínima**

`src/backend/db/client.ts`:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// O hot reload do Vite reavalia este módulo a cada alteração. Guardar a instância
// no escopo global impede que as conexões se acumulem até o Postgres recusar novas.
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL não definida. Copie .env.example para .env.");
  }

  // No Prisma 7 o cliente não lê a URL do schema — a conexão vem deste adapter.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 7: Rodar o teste para verificar que passa**

```bash
npm test
```

Esperado: PASS, 2 testes.

Se falhar com `Cannot find module '@/generated/prisma/client'`, rode `npx prisma generate`
— o cliente ainda não foi gerado.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts src/backend/db/client.ts src/backend/db/client.test.ts src/backend/db/testing.ts package.json
git commit -m "Adiciona o cliente Prisma singleton e a configuração de testes"
```

---

## Task 8: Limpeza das tabelas entre testes

**Files:**
- Modify: `src/backend/db/testing.ts`
- Test: `src/backend/db/testing.test.ts`

Cada caso precisa começar com o banco vazio, senão o resultado depende da ordem de
execução. `TRUNCATE ... CASCADE` numa única instrução respeita as chaves estrangeiras.

- [ ] **Step 1: Escrever o teste que falha**

`src/backend/db/testing.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/backend/db/client";
import { resetDatabase } from "@/backend/db/testing";

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
```

- [ ] **Step 2: Rodar o teste para verificar que falha**

```bash
npm test src/backend/db/testing.test.ts
```

Esperado: **FALHA** com `resetDatabase is not exported` ou `is not a function`.

- [ ] **Step 3: Implementar `resetDatabase`**

Substitua o conteúdo inteiro de `src/backend/db/testing.ts` pelo abaixo.

O detalhe que exige atenção: `import` estático é içado para o topo do módulo e executa
**antes** de qualquer atribuição. Se o cliente fosse importado estaticamente aqui, ele
seria construído lendo a `DATABASE_URL` de desenvolvimento — e os testes truncariam o
banco de desenvolvimento. Por isso o cliente é importado dinamicamente, depois da troca.

```ts
import "dotenv/config";

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL não definida. Copie .env.example para .env e preencha as duas URLs.",
  );
}

if (testUrl === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL é igual a DATABASE_URL. Os testes truncam as tabelas — " +
      "apontar para o banco de desenvolvimento apagaria seus dados.",
  );
}

process.env.DATABASE_URL = testUrl;

// Importado dinamicamente para que DATABASE_URL já esteja trocada quando o
// cliente for construído.
const { prisma } = await import("@/backend/db/client");

export async function resetDatabase() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
```

- [ ] **Step 4: Rodar o teste para verificar que passa**

```bash
npm test src/backend/db/testing.test.ts
```

Esperado: PASS, 3 testes.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
npm test
```

Esperado: PASS, 5 testes.

- [ ] **Step 6: Commit**

```bash
git add src/backend/db/testing.ts src/backend/db/testing.test.ts
git commit -m "Adiciona limpeza do banco entre os testes"
```

---

## Task 9: Seed — usuários e workspaces

**Files:**
- Create: `prisma/seed.ts`
- Test: `prisma/seed.test.ts`
- Modify: `tsconfig.json`

Antes de tudo, acrescente `prisma/**/*.ts`, `vitest.config.ts` e `prisma.config.ts` ao
`include` do `tsconfig.json`. O alias `@/` é resolvido pelo `vite-tsconfig-paths` apenas
nos arquivos cobertos pelo `include`, e hoje ele só lista `src/**` — sem essa mudança,
`prisma/seed.test.ts` falha com `Cannot find package '@/backend/db/client'`.

Os dados reproduzem exatamente o que o app mostra hoje, extraídos de
`src/lib/store.ts:171-254`. Os três `Member` do seed atual viram três `User` reais.

O seed é idempotente: apaga e recria. Rodar duas vezes deixa o mesmo resultado.

- [ ] **Step 1: Escrever o teste que falha**

`prisma/seed.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/backend/db/client";
import { resetDatabase } from "@/backend/db/testing";
import { seed } from "./seed";

describe("seed", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seed();
  });

  it("cria os três usuários", async () => {
    const users = await prisma.user.findMany({ orderBy: { email: "asc" } });
    expect(users.map((u) => u.email)).toEqual([
      "ana@acme.com",
      "bruno@acme.com",
      "voce@flow.app",
    ]);
  });

  it("cria os dois workspaces", async () => {
    const workspaces = await prisma.workspace.findMany({ orderBy: { name: "asc" } });
    expect(workspaces.map((w) => w.name)).toEqual(["Acme Inc.", "Projetos pessoais"]);
  });

  it("dá três membros à Acme e um aos Projetos pessoais", async () => {
    const acme = await prisma.workspace.findFirstOrThrow({ where: { name: "Acme Inc." } });
    const pessoal = await prisma.workspace.findFirstOrThrow({
      where: { name: "Projetos pessoais" },
    });

    expect(await prisma.workspaceMember.count({ where: { workspaceId: acme.id } })).toBe(3);
    expect(await prisma.workspaceMember.count({ where: { workspaceId: pessoal.id } })).toBe(1);
  });

  it("cria as quatro etiquetas da Acme com as cores originais", async () => {
    const acme = await prisma.workspace.findFirstOrThrow({ where: { name: "Acme Inc." } });
    const labels = await prisma.label.findMany({
      where: { workspaceId: acme.id },
      orderBy: { name: "asc" },
    });

    expect(labels.map((l) => [l.name, l.color])).toEqual([
      ["design", "#ec4899"],
      ["jurídico", "#8b5cf6"],
      ["produto", "#10b981"],
      ["urgente", "#ef4444"],
    ]);
  });

  it("é idempotente", async () => {
    await seed();
    expect(await prisma.user.count()).toBe(3);
    expect(await prisma.workspace.count()).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar o teste para verificar que falha**

```bash
npm test prisma/seed.test.ts
```

Esperado: **FALHA** com `Failed to resolve import "./seed"`.

- [ ] **Step 3: Escrever o seed**

`prisma/seed.ts`:

```ts
import { prisma } from "@/backend/db/client";

const ISO_BASE = new Date("2025-01-01T00:00:00.000Z");

export async function seed() {
  // Idempotente: apagar os workspaces leva junto tudo que depende deles por cascata,
  // e apagar os usuários limpa o resto.
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  const voce = await prisma.user.create({
    data: {
      name: "Você",
      email: "voce@flow.app",
      avatarColor: "#6366f1",
      title: "Product Manager",
    },
  });

  const ana = await prisma.user.create({
    data: { name: "Ana Souza", email: "ana@acme.com", avatarColor: "#ec4899" },
  });

  const bruno = await prisma.user.create({
    data: { name: "Bruno Lima", email: "bruno@acme.com", avatarColor: "#10b981" },
  });

  const acme = await prisma.workspace.create({
    data: {
      name: "Acme Inc.",
      color: "#6366f1",
      description: "Cliente principal — produto B2B",
      createdAt: ISO_BASE,
      members: {
        create: [
          { userId: voce.id, title: "Owner" },
          { userId: ana.id, title: "Design" },
          { userId: bruno.id, title: "Dev" },
        ],
      },
      labels: {
        create: [
          { name: "jurídico", color: "#8b5cf6" },
          { name: "urgente", color: "#ef4444" },
          { name: "design", color: "#ec4899" },
          { name: "produto", color: "#10b981" },
        ],
      },
      sprints: {
        create: [
          {
            name: "Sprint 12",
            goal: "Fechar release v1.2 e alinhar contrato",
            status: "active",
            createdAt: ISO_BASE,
          },
        ],
      },
      customFields: {
        create: [
          { name: "Story points", type: "number", options: [] },
          { name: "Área", type: "select", options: ["Produto", "Design", "Jurídico"] },
        ],
      },
      docs: {
        create: [
          {
            title: "Onboarding Acme",
            body: "# Contexto\n\nCliente B2B, contrato anual.\n\n## Contatos\n- Ana (Design)\n- Bruno (Dev)\n\n## Links\n- Repositório interno",
            createdAt: ISO_BASE,
          },
        ],
      },
    },
  });

  const pessoal = await prisma.workspace.create({
    data: {
      name: "Projetos pessoais",
      color: "#0ea5e9",
      description: "Ideias e side-projects",
      createdAt: ISO_BASE,
      members: { create: [{ userId: voce.id, title: "Owner" }] },
      labels: { create: [{ name: "escrita", color: "#f59e0b" }] },
    },
  });

  return { users: { voce, ana, bruno }, workspaces: { acme, pessoal } };
}

// Executado por `prisma db seed` via `tsx prisma/seed.ts`.
// `import.meta.url` só bate com o argumento quando o arquivo é o ponto de entrada,
// então importar o módulo num teste não dispara o seed.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  await seed();
  console.log("Seed aplicado.");
  await prisma.$disconnect();
}
```

- [ ] **Step 4: Rodar o teste para verificar que passa**

```bash
npm test prisma/seed.test.ts
```

Esperado: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts prisma/seed.test.ts
git commit -m "Adiciona o seed de usuários e workspaces"
```

---

## Task 10: Seed — metas, automações e tarefas

**Files:**
- Modify: `prisma/seed.ts`
- Modify: `prisma/seed.test.ts`

As quatro tarefas do seed atual estão em `src/lib/store.ts:263` em diante. As datas são
relativas à âncora `2025-07-11T12:00:00.000Z`.

Os nomes de etiqueta que a tarefa referencia (`"jurídico"`, `"urgente"`) viram vínculos
`TaskLabel` por id — é a correção de modelagem descrita no spec.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `prisma/seed.test.ts`, dentro do `describe("seed", ...)`:

```ts
  it("cria as quatro tarefas", async () => {
    expect(await prisma.task.count()).toBe(4);
  });

  it("distribui as tarefas entre os dois workspaces", async () => {
    const acme = await prisma.workspace.findFirstOrThrow({ where: { name: "Acme Inc." } });
    const pessoal = await prisma.workspace.findFirstOrThrow({
      where: { name: "Projetos pessoais" },
    });

    expect(await prisma.task.count({ where: { workspaceId: acme.id } })).toBe(3);
    expect(await prisma.task.count({ where: { workspaceId: pessoal.id } })).toBe(1);
  });

  it("liga a tarefa do contrato às etiquetas jurídico e urgente, por id", async () => {
    const task = await prisma.task.findFirstOrThrow({
      where: { title: "Revisar proposta de contrato" },
      include: { labels: { include: { label: true } } },
    });

    expect(task.labels.map((l) => l.label.name).sort()).toEqual(["jurídico", "urgente"]);
  });

  it("registra o comentário da Ana com autor real", async () => {
    const comment = await prisma.comment.findFirstOrThrow({
      include: { author: true },
    });

    expect(comment.author.name).toBe("Ana Souza");
    expect(comment.text).toBe("Enviei a última versão por email.");
  });

  it("cria as duas subtarefas na ordem original", async () => {
    const task = await prisma.task.findFirstOrThrow({
      where: { title: "Revisar proposta de contrato" },
      include: { subtasks: { orderBy: { position: "asc" } } },
    });

    expect(task.subtasks.map((s) => [s.title, s.done])).toEqual([
      ["Ler v3", true],
      ["Marcar reunião", false],
    ]);
  });

  it("cria a meta ligada ao Sprint 12", async () => {
    const goal = await prisma.goal.findFirstOrThrow({
      include: { sprints: { include: { sprint: true } } },
    });

    expect(goal.name).toBe("Release v1.2 pronta");
    expect(goal.sprints.map((s) => s.sprint.name)).toEqual(["Sprint 12"]);
  });

  it("cria a automação desligada", async () => {
    const automation = await prisma.automation.findFirstOrThrow();

    expect(automation.name).toBe("Ao concluir, remover do sprint");
    expect(automation.enabled).toBe(false);
    expect(automation.trigger).toEqual({ kind: "status_changed", to: "done" });
  });
```

- [ ] **Step 2: Rodar os testes para verificar que falham**

```bash
npm test prisma/seed.test.ts
```

Esperado: **FALHA** — `expected 0 to be 4` no primeiro caso novo, e falhas de
`findFirstOrThrow` nos demais.

- [ ] **Step 3: Acrescentar metas e automações ao seed**

Em `prisma/seed.ts`, logo após a criação de `acme` e antes da criação de `pessoal`:

```ts
  const sprint12 = await prisma.sprint.findFirstOrThrow({
    where: { workspaceId: acme.id, name: "Sprint 12" },
  });

  await prisma.goal.create({
    data: {
      workspaceId: acme.id,
      name: "Release v1.2 pronta",
      description: "Fechar todas as tarefas do Sprint 12 e publicar release.",
      createdAt: ISO_BASE,
      sprints: { create: [{ sprintId: sprint12.id }] },
    },
  });

  await prisma.automation.create({
    data: {
      workspaceId: acme.id,
      name: "Ao concluir, remover do sprint",
      enabled: false,
      trigger: { kind: "status_changed", to: "done" },
      action: { kind: "set_sprint", sprintId: "" },
      createdAt: ISO_BASE,
    },
  });
```

- [ ] **Step 4: Acrescentar as tarefas ao seed**

Ainda em `prisma/seed.ts`, depois da criação de `pessoal` e antes do `return`:

```ts
  const SEED_ANCHOR = new Date("2025-07-11T12:00:00.000Z");
  const inSeedDays = (n: number) => {
    const d = new Date(SEED_ANCHOR);
    d.setDate(d.getDate() + n);
    return d;
  };

  const acmeLabels = await prisma.label.findMany({ where: { workspaceId: acme.id } });
  const labelId = (name: string) => {
    const found = acmeLabels.find((l) => l.name === name);
    if (!found) throw new Error(`Etiqueta "${name}" não encontrada no seed da Acme.`);
    return found.id;
  };

  await prisma.task.create({
    data: {
      workspaceId: acme.id,
      title: "Revisar proposta de contrato",
      description: "Alinhar cláusulas com o jurídico antes de sexta.",
      status: "todo",
      priority: "high",
      assigneeId: voce.id,
      sprintId: sprint12.id,
      startDate: inSeedDays(0),
      dueDate: inSeedDays(2),
      estimateMinutes: 45,
      createdAt: ISO_BASE,
      labels: {
        create: [{ labelId: labelId("jurídico") }, { labelId: labelId("urgente") }],
      },
      comments: {
        create: [
          {
            authorId: ana.id,
            text: "Enviei a última versão por email.",
            createdAt: new Date("2025-07-10T12:00:00.000Z"),
          },
        ],
      },
      subtasks: {
        create: [
          { title: "Ler v3", done: true, position: 0 },
          { title: "Marcar reunião", done: false, position: 1 },
        ],
      },
      activities: {
        create: [
          {
            authorId: voce.id,
            kind: "created",
            text: "criou a tarefa",
            createdAt: ISO_BASE,
          },
        ],
      },
    },
  });

  await prisma.task.create({
    data: {
      workspaceId: acme.id,
      title: "Kickoff com time de design",
      status: "in_progress",
      priority: "medium",
      assigneeId: ana.id,
      sprintId: sprint12.id,
      dueDate: inSeedDays(0),
      createdAt: ISO_BASE,
      labels: { create: [{ labelId: labelId("design") }] },
      activities: {
        create: [
          { authorId: voce.id, kind: "created", text: "criou a tarefa", createdAt: ISO_BASE },
        ],
      },
    },
  });

  await prisma.task.create({
    data: {
      workspaceId: acme.id,
      title: "Publicar release notes v1.2",
      status: "done",
      priority: "low",
      assigneeId: bruno.id,
      sprintId: sprint12.id,
      dueDate: inSeedDays(-3),
      estimateMinutes: 60,
      createdAt: ISO_BASE,
      labels: { create: [{ labelId: labelId("produto") }] },
      activities: {
        create: [
          { authorId: voce.id, kind: "created", text: "criou a tarefa", createdAt: ISO_BASE },
        ],
      },
    },
  });

  const escrita = await prisma.label.findFirstOrThrow({
    where: { workspaceId: pessoal.id, name: "escrita" },
  });

  await prisma.task.create({
    data: {
      workspaceId: pessoal.id,
      title: "Rascunhar post sobre kanban",
      status: "todo",
      priority: "low",
      assigneeId: voce.id,
      dueDate: inSeedDays(5),
      createdAt: ISO_BASE,
      labels: { create: [{ labelId: escrita.id }] },
      activities: {
        create: [
          { authorId: voce.id, kind: "created", text: "criou a tarefa", createdAt: ISO_BASE },
        ],
      },
    },
  });
```

- [ ] **Step 5: Rodar os testes para verificar que passam**

```bash
npm test prisma/seed.test.ts
```

Esperado: PASS, 12 testes.

- [ ] **Step 6: Rodar a suíte inteira**

```bash
npm test
```

Esperado: PASS, 17 testes.

- [ ] **Step 7: Aplicar o seed no banco de desenvolvimento**

```bash
npm run db:seed
```

Esperado: `Seed aplicado.`

- [ ] **Step 8: Conferir os dados com os próprios olhos**

```bash
npm run db:studio
```

Abre o Prisma Studio no navegador. Confirme: 3 usuários, 2 workspaces, 4 tarefas, a tarefa
do contrato com duas etiquetas e duas subtarefas.

Feche o Studio com Ctrl+C antes de seguir.

- [ ] **Step 9: Commit**

```bash
git add prisma/seed.ts prisma/seed.test.ts
git commit -m "Completa o seed com metas, automação e as quatro tarefas"
```

---

## Task 11: Documentar o setup no README

**Files:**
- Modify: `README.md`

Sem isso, o próximo desenvolvedor — ou você daqui a três meses — clona o repositório e não
consegue subir o projeto, porque `npm run dev` agora depende de um banco.

- [ ] **Step 1: Substituir a seção `## Development` do `README.md`**

````markdown
## Development

Requisitos: Node.js 22+ e PostgreSQL 18 rodando localmente.

### Primeira vez

```sh
git clone <this-repository-url>
cd workspace-hub
npm install --no-package-lock
```

Crie o papel e os bancos (uma vez só):

```sh
psql -U postgres -c "CREATE ROLE flow WITH LOGIN PASSWORD 'flow_dev_local';"
psql -U postgres -c "CREATE DATABASE flow_dev OWNER flow;"
psql -U postgres -c "CREATE DATABASE flow_test OWNER flow;"
```

Copie `.env.example` para `.env` e ajuste a senha se tiver usado outra. Depois:

```sh
npm run db:migrate   # cria as tabelas
npm run db:seed      # popula com os dados de exemplo
npm run dev
```

### Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe o app em modo desenvolvimento |
| `npm test` | Roda a suíte de testes contra `flow_test` |
| `npm run db:migrate` | Cria e aplica migrations |
| `npm run db:seed` | Repopula `flow_dev` com os dados de exemplo |
| `npm run db:studio` | Abre o Prisma Studio para inspecionar o banco |
````

- [ ] **Step 2: Verificar que as instruções funcionam do zero**

```powershell
$env:PGPASSWORD = "flow_dev_local"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U flow -d flow_dev -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
Remove-Item Env:PGPASSWORD
```

Depois, seguindo o README:

```bash
npm run db:migrate
npm run db:seed
npm test
```

Esperado: migration aplica, seed roda, 17 testes passam.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Documenta o setup do banco no README"
```

---

## Critérios de conclusão deste plano

1. `npm test` passa com 17 testes.
2. `npm run db:migrate` aplica num banco vazio sem erro.
3. `npm run db:seed` produz 3 usuários, 2 workspaces e 4 tarefas.
4. `prisma/schema.prisma` tem exatamente 23 modelos.
5. `git status --short` não lista `.env` nem `src/generated/`.
6. `npm run dev` continua subindo o app — nada foi quebrado, já que nenhuma tela ainda
   consulta o banco.

## Próximos planos

| Plano | Conteúdo |
| --- | --- |
| 2 | Fatia vertical de Tarefas: repositório, server functions, boundary, Kanban lendo do banco |
| 3 | Workspaces, etiquetas, membros |
| 4 | Sprints, metas, docs, campos customizados |
| 5 | Automações, integrações, perfil |

O plano 2 estabelece o padrão das camadas de ponta a ponta; os planos 3 a 5 o repetem para
os demais agregados.
