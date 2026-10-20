# Roteiro até o MVP multiusuário

**Data:** 2026-08-05
**Decisão que originou este roteiro:** o Flow será usado por outras pessoas, não só pelo autor.
**Specs de referência:** `2026-08-02-fundacao-de-dados-design.md`, `2026-08-04-identidade-e-acesso-design.md`

---

## Onde estamos

| Camada | Estado |
| --- | --- |
| Banco, schema, migrations, seed | pronto — 23 tabelas |
| Plataforma: preset Node, ambiente validado, headers, rate-limit, CSRF | pronto |
| Leitura do board | pronta — vem do Postgres |
| Escrita | **18 de 53 mutações** (34%) |
| Autenticação | inexistente — usuário fixo em `current-user.ts` |
| Autorização | inexistente |
| Testes | 84 passando |

Persistem hoje: as quatro operações da tarefa (criar, editar, mover, excluir) e as dez de
workspace (workspace, etiquetas, membros).

## O que "MVP multiusuário" exige

Duas pessoas de empresas diferentes usam o Flow, cada uma enxergando só os workspaces de que
participa, sem que uma consiga alcançar os dados da outra nem por acidente nem de propósito.

Isso torna **obrigatórios** três itens que seriam opcionais num app de uso próprio:

1. **Autenticação** — sem login não existe "quem é você".
2. **Autorização por workspace** — autenticar não basta. Sem filtro por membresia, qualquer
   usuário logado troca o `workspaceId` na chamada e lê os dados de qualquer cliente. É a
   falha mais grave e mais comum de SaaS multi-tenant.
3. **Convites de verdade** — hoje adicionar um membro fabrica um usuário com e-mail interno
   (`fulano.abc@local.flow`) que ninguém consegue usar para entrar. Serviu como ponte
   enquanto não havia login; num produto multiusuário é dívida que precisa ser paga.

## Princípio de sequenciamento

Cada etapa termina com o app funcionando e a suíte verde. Nada de etapa que só faz sentido
junto com a seguinte — isso é o que mantém o fluxo constante e permite parar em qualquer
ponto sem deixar o projeto quebrado.

A ordem tem duas regras que não podem ser trocadas:

- **Persistência antes de autenticação.** O middleware de auth se pendura nas server
  functions. Criar as server functions primeiro e proteger todas de uma vez é um passe; fazer
  o inverso obriga a reabrir cada arquivo.
- **Autorização depois de autenticação, e nunca depois do lançamento.** É a única etapa cuja
  ausência causa vazamento de dados entre clientes.

---

## Etapas

### E1 — Sprints e campos customizados · 6 operações

`createSprint`, `updateSprint`, `deleteSprint`, `createCustomField`, `updateCustomField`,
`deleteCustomField`.

**Por que primeiro:** não é completude, é bug ativo. `Task.sprintId` e `TaskFieldValue.fieldId`
são chaves estrangeiras. Um sprint criado só no navegador não existe no banco, então atribuir
uma tarefa a ele **faz a gravação da tarefa falhar** — uma função quebrando outra que já
funciona. É o mesmo defeito que os workspaces tinham antes de 6c88e9e.

**Pronto quando:** criar sprint, atribuir tarefa a ele e recarregar mantém tudo; o mesmo para
campo customizado com valor preenchido.

### E2 — Detalhe da tarefa · 12 operações

`addComment`, `deleteComment`, `addSubtask`, `toggleSubtask`, `renameSubtask`, `removeSubtask`,
`addTimeEntry`, `removeTimeEntry`, `setEstimate`, `setFieldValue`, `addBlocker`, `removeBlocker`.

**Por que aqui:** comentário e subtarefa são o núcleo de um gerenciador de tarefas. Um campo de
comentário que aceita texto e o descarta é pior que um campo ausente. É também a etapa mais
visível para quem usa.

`Subtask.position` precisa de atenção: a ordem hoje é implícita no vetor do navegador e passa a
ser explícita no banco.

**Pronto quando:** comentar, criar subtarefas, apontar tempo, recarregar e encontrar tudo lá.

### E3 — Metas, docs e automações · 11 operações

`createGoal`, `updateGoal`, `deleteGoal`, `toggleGoalTask`, `toggleGoalSprint`, `createDoc`,
`updateDoc`, `deleteDoc`, `createAutomation`, `updateAutomation`, `deleteAutomation`.

**Nota sobre automações:** o motor já roda no servidor, dentro da transação da mudança de
status. Falta só persistir a definição. `trigger` e `action` são colunas `Json` e **precisam de
validação zod na entrada** — hoje não há nenhuma, e Json não validado é porta aberta.

**Se o prazo apertar, esta é a etapa a cortar.** Metas e docs não bloqueiam nada.

### E4 — Perfil, favoritos e notificações · 4 operações

`updateProfile`, `togglePinWorkspace`, `togglePinTask`, `markNotificationsRead`.

Barato e muito visível. `notificationsReadAt` deixa de ser por navegador e passa a ser por
pessoa — o que só faz sentido de verdade quando houver pessoas.

### E5 — Remover o `persist` e fechar a migração

Enquanto `src/lib/store.ts` mantiver o middleware `persist` com a chave `flow-tasks-store`,
existem duas fontes da verdade disputando: o `localStorage` reidrata na criação do store e o
servidor sobrescreve na montagem. Isso produz bugs intermitentes e difíceis de reproduzir.

Entra junto uma regra de ESLint impedindo import de `@/lib/store` fora de
`src/frontend/state/` — mitigação do risco de o Lovable reintroduzir o atalho num prompt futuro.

**Pronto quando:** `localStorage` vazio depois de uso normal, e a suíte verde.

**Marco:** aqui o servidor passa a ser a única fonte da verdade. É o fim da migração de dados
e o começo da parte de identidade.

### E6 — Credenciais e sessão

Migration acrescentando `passwordHash`, `passwordUpdatedAt`, `failedLoginCount` e `lockedUntil`
em `User`; e `tokenHash`, `revokedAt`, `lastUsedAt` em `Session`.

Módulo de hash isolado (Argon2id via `@node-rs/argon2`) e ciclo de vida da sessão: criar, ler,
renovar, rotacionar, revogar. **O token do cookie nunca é o `Session.id`** — só o `sha256` vai
para o banco, para que um dump não permita sequestro de sessão.

Detalhe do plano 2.1: `assertNodeRuntime` já garante que o artefato roda em Node, que é o que
permite argon2 nativo.

### E7 — Cadastro, login e logout

`signUp`, `signIn`, `signOut` e as telas. Cadastro aberto, conforme decidido.

Mensagem de falha sempre genérica, e hash descartável executado quando o e-mail não existe —
senão o tempo de resposta revela quais e-mails têm conta.

Tela de recuperação de senha **sem backend**, conforme decidido: o formulário existe e devolve
a mesma mensagem neutra que devolveria com envio, sem criar token nem gravar nada. Quando o
provedor de e-mail entrar, a tela não muda.

### E8 — Proteção de rotas e bloqueio de login

Middleware de servidor exigindo sessão em toda server function de dados, e
`src/backend/workspace/current-user.ts` passando a ler a sessão em vez do e-mail fixo — **um
arquivo muda, o resto permanece**, que era o desenho desde a fundação.

Guarda de navegação com rota de layout autenticado. Lembrete: com `ssr: false`, `beforeLoad`
roda no navegador, então isso é experiência de uso, **nunca** segurança.

Defesa que escala: um teste que enumera as server functions exportadas e falha se alguma não
tiver o middleware. Mais rate-limit estrito por IP e por e-mail no login, com bloqueio
progressivo.

### E9 — Autorização por workspace · a etapa inegociável

Toda função de repositório que recebe `workspaceId` passa a receber também `userId` e filtra
por `WorkspaceMember` **dentro da consulta** — filtrar no `where` elimina a janela entre checar
e usar. Operações por `taskId` resolvem o workspace da tarefa e validam igual.

Acesso a recurso de outro workspace devolve **404, não 403**: 403 confirmaria que existe.

Para cada agregado, um teste de acesso cruzado: usuário A tenta ler, editar e excluir recurso
do workspace de B.

**Sem esta etapa o produto não pode ser aberto a ninguém.** É a diferença entre "funciona" e
"não vaza dados de cliente".

### E10 — Convites de verdade

Substitui a ponte do e-mail fabricado. Convidar por e-mail gera um token de uso único; quem
aceita cria a senha e entra no workspace. Membros criados antes, com endereço `@local.flow`,
precisam de caminho de migração — provavelmente reconvite.

Depende de provedor de e-mail. Enquanto não houver, o link de convite pode ser copiado à mão da
interface: funciona, é feio, e não bloqueia o lançamento para um grupo pequeno.

---

## Resumo

| Etapa | Conteúdo | Bloqueia lançamento? |
| --- | --- | --- |
| E1 | Sprints e campos customizados | sim — bug ativo |
| E2 | Detalhe da tarefa | sim |
| E3 | Metas, docs, automações | não |
| E4 | Perfil e favoritos | não |
| E5 | Remover o `persist` | sim |
| E6 | Credenciais e sessão | sim |
| E7 | Cadastro, login, logout | sim |
| E8 | Proteção de rotas e bloqueio | sim |
| E9 | **Autorização por workspace** | **sim, absolutamente** |
| E10 | Convites | não para um grupo pequeno |

**Caminho mínimo até poder abrir para outras pessoas:** E1, E2, E5, E6, E7, E8, E9.
E3, E4 e E10 podem vir depois sem impedir o uso.

## O que já não precisa ser decidido

- Alvo de produção: Node em contêiner próprio
- Cadastro: aberto
- Recuperação de senha: só a tela, até haver provedor
- CORS: não entra — o app é same-origin
- Redis: não entra até haver mais de uma instância ou gargalo medido
- Padrão de camadas: repositório → server function com zod → write-through no store, já
  estabelecido e repetido em dois agregados

Não há decisão de arquitetura pendente de E1 a E5. O trabalho é repetição do padrão.

## Riscos que seguem valendo

- **O Lovable escreve neste repositório.** Um prompt pode remover o middleware de auth ou
  reintroduzir import direto de `@/lib/store` sem quebrar o build — quebrando a segurança em
  silêncio. As regras de ESLint da E5 e o teste enumerador da E8 são a defesa.
- **`ssr: false` e a ilusão de rota protegida.** Proteção real é sempre servidor.
- **Sessão com `Session.id` no cookie.** Erro clássico; a E6 usa `tokenHash`.
- **IDOR por `workspaceId` no payload.** Coberto pela E9, e só por ela.
