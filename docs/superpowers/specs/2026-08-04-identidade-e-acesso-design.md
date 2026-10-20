# Identidade e acesso

**Data:** 2026-08-04
**Sub-projeto:** 2 de 5
**Estado:** aprovado, pronto para planos de implementação
**Spec anterior:** `docs/superpowers/specs/2026-08-02-fundacao-de-dados-design.md`

## Contexto

O sub-projeto 1 entregou a fundação de dados: 23 tabelas migradas em PostgreSQL 18, cliente
Prisma singleton, seed e 17 testes passando. O que ele **não** entregou — por desenho — é
qualquer camada de aplicação. Hoje `src/backend/` contém apenas `db/` e `ssr/`: não existe
uma única server function no repositório, nenhum repositório, nenhuma validação de entrada.

Este sub-projeto responde à pergunta que a fundação deixou em aberto: *de quem é cada dado*.
Ele entrega cadastro, login, sessão, proteção de rotas e autorização por workspace — e, antes
disso, o endurecimento da plataforma que a autenticação pressupõe.

### O que existe hoje, em números

| Camada | Estado |
| --- | --- |
| Banco, schema, migrations, seed | Pronto (commits `15c71d5`..`c777aec`) |
| `src/backend/repositories/`, `src/backend/api/` | **Não existem** |
| Server functions | **Zero** |
| Campo de credencial em `User` | **Não existe** (`prisma/schema.prisma:22-40`) |
| `model Session` | Esqueleto: `id`, `userId`, `expiresAt`, `createdAt`. Sem uso (`:42-51`) |
| Middlewares registrados | Apenas `errorMiddleware` (`src/start.ts:21`) |
| Headers de segurança | Nenhum (`src/backend/ssr/application.ts:27-30`, `:40-43`) |
| Rate-limit, CSRF, validação de entrada | Zero |
| Operações de estado no zustand | **50**, em `src/lib/store.ts:32-160`, persistidas em `localStorage` |

## Decisões

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Alvo de produção | **Node**, em contêiner próprio | Decisão do usuário. Coerente com a decisão anterior de banco próprio: Prisma sobre TCP, hash nativo e rate-limit em processo passam a ser viáveis |
| Preset do Nitro | `node-server`, explícito em `vite.config.ts` | O padrão herdado é `cloudflare-module` (ver risco R1) |
| Cadastro | **Aberto** | Decisão do usuário. Qualquer pessoa cria conta e o próprio workspace |
| Recuperação de senha | **Somente a tela**, sem envio | Decisão do usuário: não há provedor de e-mail contratado. O backend do fluxo fica fora deste sub-projeto |
| Hash de senha | Argon2id via `@node-rs/argon2` | Recomendação corrente da OWASP para senha nova. Isolado num módulo com duas funções, trocável |
| Formato da sessão | Token opaco aleatório, `sha256` guardado no banco | Um dump do banco não permite sequestrar sessão |
| Segredo de assinatura de sessão | **Nenhum** | Ver "Por que não há `SESSION_SECRET`" |
| Armazenamento de sessão | Tabela `Session` no Postgres | Lookup por índice único. Uma instância, dezenas de usuários — não há gargalo a resolver |
| CORS | **Não implementar** | Ver "Por que CORS não entra" |
| Redis | **Não introduzir agora** | Ver "Por que Redis não entra" |
| OrbStack | **Fora de escopo** | Produto exclusivo de macOS. A máquina de desenvolvimento é Windows 10 |
| Rate-limit | Interface `RateLimitStore` + implementação em memória | Uma instância torna o contador em processo correto. A interface deixa a troca por Redis num arquivo novo |
| Autorização | Filtro por `WorkspaceMember` dentro da consulta | Filtrar no `where` elimina a janela entre checar e usar |

### Por que CORS não entra

CORS é o mecanismo para **afrouxar** a same-origin policy quando um front numa origem precisa
chamar uma API em outra. O Flow é same-origin: o SSR do TanStack Start serve a interface e as
server functions na mesma origem. Sem cabeçalho CORS nenhum, o navegador já impede que
qualquer site de terceiro leia as respostas do Flow. Zero CORS é o estado mais seguro
disponível, e acrescentá-lo só poderia enfraquecer isso.

O pedido original de "CORS" corresponde, na prática, a três necessidades reais e distintas,
todas dentro do escopo deste documento: **CSRF**, **headers de segurança de resposta** e
**cookie configurado corretamente**.

CORS passa a fazer sentido no dia em que existir um cliente de outra origem — aplicativo
móvel nativo ou CLI. Nesse dia, com allowlist explícita.

### Por que Redis não entra

Avaliação caso a caso, no estado atual:

| Uso candidato | Veredito |
| --- | --- |
| Sessão | Não. `model Session` já existe e a busca é por índice único |
| Rate-limit | Não. Uma instância de Node torna o contador em memória correto e exato |
| Cache de leitura | Não. Não existe consulta lenta medida — não existe consulta de aplicação nenhuma ainda |
| Fila | Não. Automações rodam dentro da transação da mutação; não há trabalho assíncrono no escopo |

Subir Redis hoje adiciona um serviço para operar, versionar e monitorar sem nenhum gargalo
medido do outro lado. A mitigação do risco de acoplamento é a interface `RateLimitStore`:
trocar a implementação por Redis é um arquivo novo, não uma refatoração.

**Gatilhos para reabrir esta decisão**, a serem verificados antes de cada release: mais de uma
instância do servidor em produção; mudança do alvo para Cloudflare Workers; p95 de leitura
acima de 200 ms com causa atribuída ao banco.

### Por que não há `SESSION_SECRET`

O padrão de sessão assinada (`valor.assinatura`) existe para permitir que o servidor confie
num cookie **sem consultar o banco**. Este projeto consulta o banco a cada requisição de
qualquer forma, porque precisa de revogação imediata.

Com token opaco de 32 bytes aleatórios e apenas o `sha256` persistido, a segurança vem da
entropia do token, não de um segredo. Um segredo adicional não acrescentaria proteção: se o
atacante tem o token, ele tem a sessão; se não tem, adivinhar 256 bits é inviável. Introduzir
uma variável de ambiente que não protege nada cria uma falsa sensação de segurança e mais uma
coisa para rotacionar errado.

### Risco assumido: autenticação própria, reafirmado

A spec anterior (`:45-51`) registrou que escrever autenticação em código transfere a este
projeto a responsabilidade permanente por hashing, expiração e rotação de sessão e proteção
contra força bruta. A decisão foi reafirmada. Este documento a executa com os cuidados
listados na seção "Segurança".

O que **não** está coberto e vira dívida consciente: verificação de e-mail, autenticação de
dois fatores e o backend de recuperação de senha.

## Escopo

### Entra

1. **Endurecimento da plataforma** — preset fixado, configuração de ambiente validada no boot,
   headers de segurança na resposta, rate-limit amplo por IP.
2. **Credenciais e sessão** — campos de credencial em `User`, `Session` endurecida, módulo de
   hash isolado, ciclo de vida completo da sessão.
3. **Pontos de entrada** — `signUp`, `signIn`, `signOut`, telas de cadastro e login, tela de
   recuperação de senha sem backend.
4. **Proteção de rotas** — middleware de servidor obrigatório, guarda de navegação, rota de
   layout autenticado.
5. **CSRF** e **rate-limit estrito com bloqueio** nas rotas de autenticação.
6. **Autorização por workspace** em toda função de repositório.

### Fica de fora

| Fora do escopo | Onde entra |
| --- | --- |
| Envio de e-mail e o backend de recuperação de senha | Quando houver provedor contratado |
| Verificação de e-mail no cadastro | Junto com o provedor de e-mail |
| Autenticação de dois fatores | Não planejado |
| Convites e papéis com permissão granular | Sub-projeto 3 |
| CSP em modo bloqueante | Depois: exige nonce nos scripts injetados pelo TanStack Start |
| Tempo real | Sub-projeto 4 |
| Reativar SSR | Depois da remoção do `persist` |

### A dependência com a fatia de Tarefas

O plano 2 do sub-projeto 1 — a fatia vertical de Tarefas, que cria as primeiras server
functions e o primeiro repositório — **precisa vir antes** dos planos de autenticação deste
documento, e depois do endurecimento da plataforma.

O motivo é prático nos dois sentidos. Escrever autenticação sem que exista uma única server
function no repositório é projetar no escuro: não há padrão de camada para o middleware se
acoplar. E migrar as 50 operações com usuário fixo para só depois plugar autenticação
obrigaria a reabrir todos os arquivos para anexar middleware e checagem de membresia.

A fatia de Tarefas paga o custo de estabelecer o padrão; a autenticação entra em seguida; as
fatias restantes nascem já protegidas.

## Arquitetura

```
src/routes/ · src/components/            telas, guarda de navegação (UX)
        ↓
src/frontend/state/workspace-store.ts    boundary de estado
        ↓
src/backend/api/                         server functions + zod + middlewares
        ↓
src/backend/auth/                        sessão, middleware, autorização
src/backend/security/                    hash, rate-limit, CSRF, IP do cliente
        ↓
src/backend/repositories/                um arquivo por agregado, filtra por membresia
        ↓
src/backend/db/ · prisma/                Prisma + PostgreSQL          [pronto]

src/backend/config/env.ts                configuração validada, consumida por todos
src/backend/http/security-headers.ts     aplicado no boundary de transporte
```

### Arquivos por responsabilidade

| Arquivo | Responsabilidade |
| --- | --- |
| `src/backend/config/env.ts` | Lê e valida as variáveis de ambiente. Falha no arranque |
| `src/backend/http/security-headers.ts` | Acrescenta headers de segurança a uma `Response` |
| `src/backend/security/client-ip.ts` | Resolve o IP do cliente a partir do header confiável |
| `src/backend/security/rate-limit.ts` | Interface `RateLimitStore` + implementação em memória |
| `src/backend/security/password.ts` | `hash`, `verify`, `needsRehash`. Nenhuma outra dependência |
| `src/backend/security/csrf.ts` | Valida a origem de requisições de mutação |
| `src/backend/auth/session.ts` | Criar, ler, renovar, rotacionar e revogar sessão |
| `src/backend/auth/middleware.ts` | Exige sessão válida; injeta o usuário no contexto |
| `src/backend/auth/authorization.ts` | `assertMember(userId, workspaceId)` |
| `src/backend/api/current-user.ts` | Responde "quem é o usuário atual". **Único arquivo que muda** ao sair do usuário fixo |
| `src/backend/api/auth.ts` | `signUp`, `signIn`, `signOut`, `me` |

## Modelo de dados

Duas tabelas mudam. Nenhuma tabela nova.

### `User` — campos de credencial

| Campo | Tipo | Motivo |
| --- | --- | --- |
| `passwordHash` | `String?` | Nulo permitido: os três usuários do seed já existem sem senha |
| `passwordUpdatedAt` | `DateTime?` | Permite invalidar sessões anteriores a uma troca de senha |
| `failedLoginCount` | `Int @default(0)` | Base do bloqueio progressivo |
| `lockedUntil` | `DateTime?` | Bloqueio temporário após tentativas seguidas |

### `Session` — endurecimento

| Campo | Tipo | Motivo |
| --- | --- | --- |
| `tokenHash` | `String @unique` | **O `id` nunca vai para o cookie.** Só o `sha256` do token é persistido |
| `revokedAt` | `DateTime?` | Revogação explícita, sem apagar o registro de auditoria |
| `lastUsedAt` | `DateTime` | Base da renovação deslizante |
| `userAgent` | `String?` | Auditoria: listar dispositivos conectados |
| `ipAddress` | `String?` | Auditoria |

Índice adicional em `expiresAt`, para a limpeza de sessões vencidas.

## Fluxos

### Cadastro

1. zod normaliza o e-mail (trim + lowercase) e exige senha de **12 caracteres no mínimo** —
   comprimento supera complexidade e é a orientação corrente da OWASP.
2. Numa transação: cria `User` com `passwordHash`, cria o `Workspace` inicial da pessoa e o
   `WorkspaceMember` com `title: "Owner"`.
3. Emite sessão e grava o cookie.

E-mail já cadastrado devolve erro tratado no campo, nunca uma violação de restrição vazando
como 500.

### Login

1. Busca por e-mail. **Se não existir, executa mesmo assim um hash descartável** — sem isso, o
   tempo de resposta revela quais e-mails têm conta.
2. Verifica `lockedUntil`.
3. Compara o hash. Sucesso zera `failedLoginCount`; falha incrementa e pode gravar
   `lockedUntil`.
4. Rotaciona: revoga a sessão anterior e emite token novo — previne fixação de sessão.
5. Mensagem de falha **sempre genérica**: "e-mail ou senha inválidos". Nunca distinguir e-mail
   inexistente de senha errada.

### Sessão

- Token: 32 bytes de `crypto.randomBytes`, codificado em base64url.
- Persistido apenas como `sha256(token)`.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` alinhado a `expiresAt`, e `Secure`
  **somente em produção** — `Secure` em `http://localhost` impediria o login em
  desenvolvimento.
- Renovação deslizante: passada a metade do TTL, emite token novo e atualiza `lastUsedAt`.
- Limpeza de sessões vencidas de forma oportunista no login. Não há cron neste sub-projeto.

### Recuperação de senha — somente a tela

Não há provedor de e-mail. A tela `/forgot-password` é construída completa — formulário,
validação, estado de envio — e a submissão **não dispara nenhum efeito**: exibe a mesma
mensagem neutra que exibiria com backend ("Se houver uma conta com esse e-mail, enviaremos as
instruções"), sem criar token, sem gravar nada.

Duas consequências assumidas e registradas:

1. A tela **não funciona**. Quem esquecer a senha não recupera o acesso até o backend existir.
   Em desenvolvimento, a saída é redefinir pelo seed.
2. A mensagem neutra é a mesma que o fluxo real usaria, então a tela não vaza quais e-mails
   têm conta — e não precisará ser reescrita quando o envio chegar.

O que **falta** para completar: provedor (Resend), tabela de tokens de uso único com
expiração curta, rate-limit próprio no pedido, e tela de definição da nova senha.

### Logout

Revoga a sessão no banco e limpa o cookie. Revogar no banco é o que importa: apagar só o
cookie deixaria o token válido para quem o tivesse copiado.

## Segurança

### Headers de resposta

Aplicados em `src/backend/ssr/application.ts`, o boundary de transporte declarado do projeto —
**inclusive no caminho de erro 500**, que hoje devolve só `content-type`.

| Header | Valor | Ressalva |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | — |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | — |
| `Permissions-Policy` | câmera, microfone e geolocalização negados | — |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | **Só em produção.** HSTS em `localhost` afeta todo projeto servido na mesma porta |
| `X-Frame-Options` | `DENY` | **Só em produção.** O preview do Lovable roda o app em iframe |
| `Content-Security-Policy-Report-Only` | `default-src 'self'` e derivados | Modo relatório. Bloquear exige nonce nos scripts de hidratação — fora de escopo |

### CSRF

`SameSite=Lax` cobre a maior parte, mas não tudo: o TanStack Start aceita server functions com
`FormData`, que é "requisição simples" e **não dispara preflight**. É a superfície real.

**Não é preciso escrever este middleware.** O TanStack Start já exporta `createCsrfMiddleware`
de `@tanstack/react-start`
(`node_modules/@tanstack/start-client-core/dist/esm/createCsrfMiddleware.d.ts`), com
exatamente a semântica desejada: valida `Origin`, aceita `Sec-Fetch-Site` (padrão
`same-origin`), usa `Referer` como alternativa, responde 403 e — o padrão que importa —
`allowRequestsWithoutOriginCheck` é `false`, ou seja, requisição sem nenhum dos três
cabeçalhos é rejeitada.

Escrever uma versão própria seria reimplementar código testado do framework e assumir a
manutenção dele. Usa-se o middleware pronto, com `filter` restringindo a validação a
requisições não-idempotentes e uma exceção **apenas em desenvolvimento** caso o preview do
Lovable, que roda em iframe de outra origem, seja barrado.

Não há token de CSRF por formulário: `SameSite` mais verificação de origem cobrem o modelo de
ameaça de um app same-origin, e tokens por formulário acrescentariam estado sem fechar
nenhuma brecha adicional aqui.

Como o middleware não depende de sessão, ele entra já no plano 2.1 — em pé antes de existir o
primeiro cookie que ele protege.

### Rate-limit

Dois níveis, ambos necessários:

| Nível | Onde | Limite | Chave |
| --- | --- | --- | --- |
| Amplo | `requestMiddleware` em `src/start.ts` | ~300 req/min | IP |
| Estrito | Middleware de `signIn`, `signUp` | 10/15 min por IP **e** 5/15 min por e-mail | IP e e-mail |

O limite amplo não protege login: 300 requisições por minuto são 300 tentativas de senha por
minuto. O limite por **e-mail** é o que resiste a um atacante distribuído por muitos IPs.

Armadilha registrada: `x-forwarded-for` é forjável se não houver proxy confiável à frente.
`TRUSTED_PROXY_HEADER` define qual header é fonte de verdade, e a ausência de configuração em
produção é tratada como configuração inválida no boot — não como padrão silencioso.

### Autorização — a falha mais provável

**Autenticação não é autorização.** Sem esta camada, qualquer usuário autenticado troca o
`workspaceId` no payload e lê os dados de qualquer cliente. É a falha clássica de SaaS
multi-tenant e nenhuma das camadas anteriores a cobre.

Toda função de repositório que recebe `workspaceId` recebe também `userId` e filtra por
`WorkspaceMember` **dentro da consulta**. O índice único `@@unique([workspaceId, userId])` em
`prisma/schema.prisma:63` já existe. Operações identificadas por `taskId` resolvem o workspace
da tarefa e validam do mesmo modo.

Acesso a recurso de outro workspace devolve **404, não 403** — 403 confirmaria que o recurso
existe.

### Proteção de rota é servidor, não navegador

Com `ssr: false` em `src/routes/__root.tsx:81`, `beforeLoad` roda **no navegador**. A guarda de
navegação é exclusivamente experiência de uso. A proteção real são os middlewares de servidor,
e as duas coisas não se substituem.

Defesa que escala: um teste que enumera as server functions exportadas e falha se alguma não
tiver o middleware de autenticação, mais um helper `authedServerFn` que torna a proteção o
padrão e a exposição pública a exceção explícita.

## Riscos

**R1 — O sandbox do Lovable força Cloudflare, sobrescrevendo o preset.**
`node_modules/@lovable.dev/vite-tanstack-config/dist/index.js:577-583` monta
`{ defaultPreset: "cloudflare-module", ...userNitroOpts }` e, quando `isSandbox` é verdadeiro
(`LOVABLE_SANDBOX=1` ou `DEV_SERVER__PROJECT_PATH` definida), executa
`delete nitroOpts.defaultPreset; nitroOpts.preset = "cloudflare-module"` — **descartando o
preset configurado**. Localmente `node-server` vale; num build feito pelo sandbox, não.
Consequência: publicar pelo Lovable produziria um artefato Cloudflare onde `@node-rs/argon2`
não carrega e o rate-limit em memória não funciona entre isolates.
Mitigação: publicar exclusivamente pelo pipeline próprio, e uma verificação no arranque que
recusa subir se o artefato não for o esperado.

**R2 — O Lovable escreve no mesmo repositório que a camada de segurança.**
Um prompt pode remover o middleware de `src/start.ts`, desfazer os headers ou reintroduzir
import direto de `@/lib/store`. Nada disso quebra o build — quebra a segurança em silêncio.
Mitigação: regras de ESLint e testes de fumaça que verificam presença dos middlewares e dos
headers são parte do produto, não polimento.

**R3 — Nitro 3 beta.** `package.json:92` fixa `3.0.260603-beta` sem caret, o que está correto.
Qualquer atualização exige revalidar headers, middleware amplo e CSRF.

**R4 — `@node-rs/argon2` é módulo nativo.** O projeto versiona `bun.lock` e instala com
`npm --no-package-lock`. Verificar que o binário pré-compilado resolve nos dois ambientes antes
de adotar; a alternativa é `scrypt` de `@noble/hashes`, em JS puro.

**R5 — `resetDatabase()` compara URLs inteiras.** A guarda em `src/backend/db/testing.ts`
protege contra apontar o teste para o banco de desenvolvimento, mas compara as strings
completas: URLs que difiram apenas pelo parâmetro `?schema=` passam pela guarda e o `TRUNCATE`
apaga o banco errado. Comparar o nome do banco, não a URL.

**R6 — Prisma 7 sem `url` no schema.** A URL vive só em `prisma.config.ts`. Em produção,
`DATABASE_URL` precisa existir no ambiente do processo, e `.env` não é versionado. Coberto pela
validação de ambiente.

## Testes

Mantida a estrutura de três níveis da spec anterior, com um quarto nível novo:

| Nível | Isolamento | Cobre |
| --- | --- | --- |
| Unidades puras | Nenhum | Validação de ambiente, headers, rate-limit, resolução de IP, hash |
| Repositórios | Banco `flow_test` | Membresia, cascata, unicidade, transação |
| Server functions | Repositório falso | Validação de entrada e autorização |
| Fumaça de segurança | Servidor real | Headers presentes, 401 sem cookie, 403 de origem estrangeira, 429 no limite |

O nível de fumaça existe por causa do R2: é o que detecta uma proteção removida por acidente.

Implementação por test-driven development: teste que falha antes do código que passa.

## Critérios de aceite

1. `npm run build` produz artefato Node, sem aviso de preset.
2. Subir o servidor sem uma variável obrigatória falha no arranque nomeando a variável.
3. `curl -I` mostra os headers de segurança, inclusive numa resposta 500.
4. HSTS e `X-Frame-Options` ausentes em desenvolvimento; presentes em produção.
5. O preview do Lovable continua renderizando.
6. Estourar o limite amplo devolve 429 com `Retry-After`; carregar a home normalmente não.
7. Cadastro cria usuário, workspace e membresia numa transação; e-mail duplicado devolve erro
   de campo.
8. Login errado e e-mail inexistente devolvem a mesma mensagem, em tempo comparável.
9. Nenhuma resposta de autenticação contém `passwordHash`.
10. O valor do cookie não aparece em texto claro em nenhuma coluna do banco.
11. Novo login invalida o token anterior.
12. Server function de dados sem cookie devolve 401 — verificado por `curl`, não pela interface.
13. Existe teste que falha se uma server function exportada não tiver o middleware.
14. Para cada agregado, acesso cruzado entre workspaces devolve 404.
15. N+1 tentativas de senha no mesmo e-mail bloqueiam mesmo trocando de IP.
16. `npm test` passa inteiro, incluindo os 17 testes já existentes.

## Planos derivados

| Plano | Conteúdo | Depende de |
| --- | --- | --- |
| **2.1** | Preset, ambiente validado, headers, rate-limit amplo, CSRF | — |
| 1.2 | Fatia vertical de Tarefas (do sub-projeto 1) | 2.1 |
| 2.2 | Credenciais no schema, hash, ciclo de vida da sessão | 1.2 |
| 2.3 | `signUp`, `signIn`, `signOut`, telas, tela de recuperação | 2.2 |
| 2.4 | Middleware de rota, guarda de navegação, bloqueio de login | 2.3 |
| 2.5 | Autorização por workspace | 2.4 |

Estimativa realista do sub-projeto inteiro: três a cinco semanas de trabalho focado.

Corte defensável sob pressão de prazo: adiar a reativação de SSR e a auditoria de dispositivos.
Corte **não** defensável: 2.4 e 2.5 — são as duas que separam "funciona" de "não vaza dados de
cliente".

## Questões em aberto

- **Provedor de e-mail.** Resend é a intenção declarada, sem contratação. Reabre o backend de
  recuperação de senha e a verificação de e-mail.
- **Hospedagem concreta do contêiner.** Define como `DATABASE_URL` chega ao processo e qual
  header de IP é confiável. Necessária antes do primeiro deploy, não antes do plano 2.1.
- **Política de expiração de sessão.** TTL de 30 dias com renovação deslizante é o ponto de
  partida; ajustável sem mudança de schema.
