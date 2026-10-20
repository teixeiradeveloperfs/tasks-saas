# Fundação de dados

**Data:** 2026-08-02
**Sub-projeto:** 1 de 5
**Estado:** aprovado, pronto para plano de implementação

## Contexto

O Flow é uma plataforma de gestão de tarefas com workspaces separados por cliente ou
empresa. A camada de produto está avançada — 14 páginas navegáveis, 13 entidades modeladas,
40 operações de estado — mas a camada de plataforma não existe. Todo o estado vive em
`zustand` com o middleware `persist`, gravando no `localStorage` do navegador
(`src/lib/store.ts:1179`, chave `flow-tasks-store`, versão 7).

O objetivo declarado é transformar isso num produto real multiusuário. Esta fundação é o
primeiro dos cinco sub-projetos que levam até lá:

1. **Fundação de dados** — este documento
2. Identidade e acesso — cadastro, login, sessão
3. Colaboração multiusuário — convites, permissões, edição concorrente
4. Tempo real — opcional
5. Integrações reais — hoje simuladas

A ordem é obrigatória para 1 → 2 → 3. Os itens 4 e 5 podem ser cortados.

### Limitações do estado atual

- Dados presos a um navegador. Trocar de máquina perde tudo.
- `Member` é decorativo: nome e cor, sem usuário por trás. "Equipe" não representa pessoas.
- `ssr: false` em `src/routes/__root.tsx:81` é obrigatório, porque `localStorage` não existe
  no servidor.
- Nenhum teste e nenhuma validação de entrada.

## Decisões

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Banco | PostgreSQL 18 próprio, em contêiner Docker | Decisão do usuário: banco próprio, sem fornecedor gerenciado. A instalação nativa da máquina foi descartada porque a senha do superusuário não era recuperável; no contêiner a senha é definida pela configuração. Mapeado na 5433, já que a instalação nativa ocupa a 5432 |
| Acesso a dados | Prisma | Migrations maduras, cliente tipado, Prisma Studio para inspecionar |
| Autenticação | Escrita em código, no sub-projeto 2 | Decisão do usuário: sem biblioteca de auth nem fornecedor |
| Fonte da verdade | O servidor | Único modelo correto quando duas pessoas editam a mesma tarefa |
| Camada de estado no cliente | React Query atrás do boundary existente | Já instalado e provido no root; caminho nativo do TanStack Start |
| Dados iniciais | Seed com os workspaces de exemplo | Sem rotina de importação do `localStorage` |

### Risco assumido: autenticação própria

Escrever a autenticação em código transfere para este projeto a responsabilidade
permanente por hashing de senha, expiração e rotação de sessão, redefinição de senha por
e-mail e proteção contra força bruta. É factível e será implementado com cuidado no
sub-projeto 2. Fica registrado que é uma decisão consciente do usuário, tomada após a
ressalva ter sido apresentada.

## Escopo

### Entra

- Schema Prisma completo — 23 tabelas
- Banco de desenvolvimento e banco de teste num contêiner PostgreSQL 18, com variáveis de
  ambiente documentadas em `.env.example`
- Cliente Prisma singleton, seguro para o hot reload do dev server
- Camada de repositórios, um arquivo por agregado
- Server functions cobrindo as 40 operações do store atual
- Boundary de estado reescrito sobre React Query, preservando as assinaturas de mutação
- Seed com Acme Inc. e Projetos pessoais, equivalente ao que o app mostra hoje
- vitest instalado e os três níveis de teste descritos abaixo

### Fica de fora

| Fora do escopo | Onde entra |
| --- | --- |
| Cadastro, login e sessão | Sub-projeto 2 |
| Convites e permissões por papel | Sub-projeto 3 |
| Tempo real | Sub-projeto 4 |
| Integrações de verdade | Sub-projeto 5 |
| Reativar SSR | Depois — possível, mas não agora |
| Importar o `localStorage` existente | Descartado por decisão do usuário |

### A fronteira com o sub-projeto 2

"O servidor é a fonte da verdade" exige saber de quem é cada dado, mas login só chega no
sub-projeto 2. A solução:

- O schema já nasce multiusuário. Toda tabela tem dono real por chave estrangeira.
- Um único módulo do backend responde à pergunta "quem é o usuário atual". Nesta fase ele
  devolve um usuário fixo criado pelo seed.
- No sub-projeto 2, esse módulo passa a ler a sessão. Um arquivo muda; o resto permanece.

Nenhum código escrito aqui precisa ser desfeito depois.

## Arquitetura

As camadas seguem a separação que o projeto já adota entre `backend/`, `frontend/` e
`shared/`. Cada camada só conhece a de baixo.

```
src/routes/ · src/components/          19 consumidores, 82 chamadas      [mantido]
        ↓ importa estado de
src/frontend/state/workspace-store.ts  boundary de estado                [reescrito]
        ↓ consulta e invalida
src/frontend/state/queries|mutations/  React Query                       [novo]
        ↓ chama pela rede
src/backend/api/                       server functions, zod, usuário    [novo]
        ↓ delega
src/backend/repositories/              um arquivo por agregado           [novo]
        ↓ consulta
prisma/schema.prisma · src/backend/db/ Prisma + PostgreSQL               [novo]

src/shared/domain/models.ts            contrato entre servidor e cliente [mantido]
```

### Por que as telas não mudam

Os 19 arquivos consumidores — 14 rotas e 5 componentes — importam estado exclusivamente de
`src/frontend/state/workspace-store.ts`. Nenhuma importa `@/lib/store` diretamente — o
módulo foi criado justamente para "deixar a implementação de persistência livre para
evoluir", e essa disciplina foi mantida.

Das 82 chamadas ao store, a maioria são mutações (`createTask`, `updateTask`,
`addComment`, …). O boundary as expõe com **assinatura idêntica**, chamando o servidor por
baixo. Só as leituras (`useStore((s) => s.tasks)`) precisam de tratamento novo, porque
passam a ter estado de carregamento e de erro.

### O contrato compartilhado

`src/shared/domain/models.ts` permanece a definição de domínio usada pelos dois lados. Os
tipos gerados pelo Prisma ficam contidos no backend: os repositórios traduzem linha de
banco para tipo de domínio antes de devolver. As telas nunca passam a depender do ORM, o
que mantém a opção de trocar o Prisma no futuro sem tocar em nada acima da fronteira HTTP.

### Isolamento de cada unidade

- **Repositório** — recebe e devolve tipos de domínio, fala com o banco, não sabe que HTTP
  existe. Testável contra um banco de teste.
- **Server function** — valida entrada, resolve o usuário atual, delega ao repositório.
  Não contém regra de negócio. Testável com repositório falso.
- **Boundary de estado** — traduz as chamadas das telas em consultas e mutações do React
  Query. Não conhece o banco. Testável com server functions falsas.

## Modelo de dados

23 tabelas, derivadas de `src/shared/domain/models.ts`.

### Identidade — 3 tabelas

| Tabela | Origem | Observação |
| --- | --- | --- |
| `User` | `Profile` + `Member` | `name`, `email` (único), `avatarColor`, `bio`, `notificationsReadAt`. Campos de credencial chegam no sub-projeto 2 |
| `Session` | nova | Criada vazia aqui; usada no sub-projeto 2 |
| `WorkspaceMember` | `Member` | Vínculo `userId` × `workspaceId`, único no par |

`Member.role` no código atual guarda textos como "Owner", "Design", "Dev" — são cargos
livres, não permissões. O campo vira `WorkspaceMember.title` (texto livre). Permissões
reais são um campo separado que chega no sub-projeto 3, para não confundir os dois
conceitos desde já.

### Workspace — 10 tabelas

`Workspace`, `Label`, `Sprint`, `CustomField`, `Doc`, `Goal`, `GoalTask`, `GoalSprint`,
`Automation`, `Integration`.

Tudo que hoje é vetor aninhado dentro do objeto `Workspace` vira tabela própria com chave
estrangeira e exclusão em cascata. `Goal.taskIds` e `Goal.sprintIds` viram as junções
`GoalTask` e `GoalSprint`.

`Automation.trigger` e `Automation.action` são uniões discriminadas
(`AutomationTrigger`, `AutomationAction`). Ficam como colunas `Json`, validadas por zod na
entrada — normalizá-las em tabelas exigiria uma tabela por variante sem ganho de consulta,
já que nunca são filtradas por conteúdo.

### Tarefa — 8 tabelas

`Task`, `TaskLabel`, `Comment`, `Subtask`, `TimeEntry`, `TaskFieldValue`, `Activity`,
`TaskBlocker`.

`TaskBlocker` é auto-relação: `taskId` × `blockedByTaskId`.

Índices em `Task` por `workspaceId`, `status`, `assigneeId` e `sprintId` — são exatamente
as colunas que o Kanban, o Workload e os filtros do board consultam o tempo todo.

### Perfil — 2 tabelas

`PinnedWorkspace` e `PinnedTask`, junções de `userId` com o alvo fixado. Poderiam ser
vetores em `User`, mas como junção a exclusão em cascata limpa sozinha quando o alvo
some — hoje `deleteWorkspace` e `deleteTask` precisam filtrar as listas de fixados à mão
(`store.ts:509`, `store.ts:980`).

### Correções de modelagem

**Etiquetas passam a ser relação.** Hoje `Task.labels` é um vetor de *nomes*
(`string[]`), enquanto `Workspace.labels` guarda objetos com `id`. Por isso `renameLabel`
precisa varrer todas as tarefas reescrevendo texto (`store.ts:531`), e nada impede que os
dois lados discordem. Com `TaskLabel` ligando por `labelId`, renomear é um `UPDATE` de uma
linha e a divergência deixa de ser possível.

**Responsável fica só como chave estrangeira.** `Task` carrega hoje `assignee` (nome) ao
lado de `assigneeId`. O nome sai; a leitura resolve o `User` por junção.

Ambas as correções são internas ao banco e aos repositórios. Os tipos de domínio expostos
às telas podem continuar entregando o formato que elas já consomem, o que mantém a
migração invisível para a interface.

## Fluxo de dados

### Leitura

Consultas do React Query com chave por escopo — `["workspaces"]`,
`["tasks", workspaceId]`. As telas ganham estado de carregamento; onde hoje há dados
imediatos, entra um esqueleto de carregamento.

### Mutação

Exemplo: arrastar uma tarefa de "A fazer" para "Em progresso" no Kanban.

1. A tela chama `moveTask(id, "in_progress")` — mesma assinatura de hoje, componente
   inalterado.
2. O React Query aplica a mudança no cache antes de qualquer rede. O cartão troca de
   coluna imediatamente.
3. A server function valida com zod e resolve o usuário atual.
4. O repositório grava **numa transação**: mudar o status também registra uma entrada de
   `Activity` e pode disparar automações. Precisa ser tudo ou nada.
5. A resposta reconcilia o cache, incluindo os efeitos que só o servidor conhece.
6. Em caso de falha, o cache volta ao estado anterior — o cartão retorna à coluna original
   e um aviso aparece via `sonner`, que já é dependência do projeto.

Operações que produzem efeitos derivados — mudança de status, exclusão em cascata,
aplicação de automação — são sempre transacionais.

## Tratamento de erros

Cada camada trata a falha que sabe nomear e deixa passar o que não sabe.

| Falha | Onde | Comportamento |
| --- | --- | --- |
| Entrada inválida | zod, na server function | Devolve o campo que falhou; o formulário mostra o erro ao lado do campo |
| Regra de domínio violada | Repositório | Erro tipado com mensagem escrita para quem lê. Ex.: sprint de outro workspace, bloqueio por tarefa inexistente |
| Rede ou banco indisponível | React Query | Reverte o otimismo, tenta de novo com espera crescente, avisa via `sonner` |
| Qualquer outra | Middleware existente | `errorMiddleware` em `src/start.ts` e o normalizador em `src/backend/ssr/application.ts` já cobrem. Nada a fazer |

## Testes

O projeto não tem nenhum teste hoje e o vitest não está instalado. A separação em camadas
existe em boa parte para tornar cada nível testável isoladamente.

| Nível | Isolamento | Cobre |
| --- | --- | --- |
| Repositórios | Banco `flow_test` separado, sem HTTP | Transação que desfaz pela metade, exclusão em cascata, unicidade, índices |
| Server functions | Repositório falso | Validação de entrada e, a partir do sub-projeto 2, autorização |
| Boundary de estado | Server functions falsas | Comportamento otimista: aplicou na hora, reverteu na falha, reconciliou no retorno |

A implementação segue test-driven development: teste que falha antes do código que passa.

## Critérios de aceite

1. As migrations aplicam do zero num banco vazio sem erro.
2. O seed produz Acme Inc. e Projetos pessoais com as mesmas tarefas, etiquetas, sprint e
   membros que o app mostra hoje.
3. Todas as 14 páginas funcionam contra o banco: criar, editar e excluir em cada uma.
4. Recarregar a página mantém os dados. Limpar o `localStorage` não perde nada.
5. Abrir o app em dois navegadores diferentes mostra os mesmos dados após revalidação.
6. Nenhum arquivo em `src/routes/` ou `src/components/` importa Prisma, direta ou
   indiretamente.
7. Nenhuma tela importa estado de fora de `src/frontend/state/workspace-store.ts`.
8. Os três níveis de teste rodam com `npm test` e passam.

## Questões em aberto

Nenhuma bloqueia o início da implementação.

- **Hospedagem de produção** — onde o Postgres roda fora do desenvolvimento. Decidir no
  sub-projeto 2, quando houver o que hospedar.
- **Estado de carregamento das telas** — se o padrão será esqueleto por seção ou por
  página. Decidir durante a implementação, tela a tela.
