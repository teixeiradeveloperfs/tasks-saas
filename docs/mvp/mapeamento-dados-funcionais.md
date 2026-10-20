# Mapeamento funcional de dados

## Fonte da verdade

O PostgreSQL é a única fonte da verdade da aplicação autenticada. O frontend carrega um
`BoardData` em `GET /api/board`, mantém uma cópia em memória no Zustand e envia cada mutação
para a API. O antigo `localStorage` (`flow-tasks-store`) é removido na inicialização e não é
usado para reidratar dados.

O arquivo `backend/prisma/seed.ts` é massa explícita de desenvolvimento e testes. Ele não é
executado no cadastro nem no carregamento normal da aplicação.

## Escopo por usuário

| Dado                                     | Persistência               | Chave de isolamento               | Estado    |
| ---------------------------------------- | -------------------------- | --------------------------------- | --------- |
| Conta e perfil                           | `User`                     | `User.id` da sessão               | Funcional |
| Sessões                                  | `Session`                  | `Session.userId` + token com hash | Funcional |
| Workspaces visíveis                      | `WorkspaceMember`          | `WorkspaceMember.userId`          | Funcional |
| Workspaces favoritos                     | `PinnedWorkspace`          | `(userId, workspaceId)`           | Funcional |
| Tarefas favoritas                        | `PinnedTask`               | `(userId, taskId)`                | Funcional |
| Notificações lidas                       | `User.notificationsReadAt` | `User.id`                         | Funcional |
| Autoria de comentário, tempo e atividade | FKs para `User`            | usuário da sessão no backend      | Funcional |

O contrato `Profile` inclui o `User.id` real. Nome, e-mail e cor não são mais suficientes para
identificar uma pessoa, pois podem mudar e podem se repetir.

## Escopo por workspace

| Agregado               | Tabelas principais                | Regra de acesso                                | Estado             |
| ---------------------- | --------------------------------- | ---------------------------------------------- | ------------------ |
| Workspace e membros    | `Workspace`, `WorkspaceMember`    | requer membresia                               | Funcional          |
| Tarefas e responsáveis | `Task`, `WorkspaceMember`, `User` | tarefa precisa pertencer a workspace acessível | Funcional          |
| Etiquetas              | `Label`, `TaskLabel`              | recurso resolvido até o workspace              | Funcional          |
| Sprints                | `Sprint`                          | recurso resolvido até o workspace              | Funcional          |
| Campos customizados    | `CustomField`, `TaskFieldValue`   | campo e tarefa precisam ser do workspace       | Funcional          |
| Docs                   | `Doc`                             | recurso resolvido até o workspace              | Funcional          |
| Metas                  | `Goal`, `GoalTask`, `GoalSprint`  | vínculos limitados ao workspace                | Funcional          |
| Automações             | `Automation`                      | definição e execução no backend                | Funcional          |
| Integrações            | `Integration`                     | configuração limitada ao workspace             | Parcial            |
| Convites               | `WorkspaceInvite`                 | criação exige membresia; token é de uso único  | Funcional por link |
| Anexos                 | `Attachment`                      | tarefa e uploader pertencem ao workspace       | Funcional          |
| Auditoria              | `AuditEvent`                      | leitura por membro; desfazer exige edição      | Funcional          |

Todas as rotas de dados usam `requireSession`. A leitura do board filtra por
`WorkspaceMember`; as mutações aplicam os níveis `OWNER`, `ADMIN`, `MEMBER` e `VIEWER`.
Acesso cruzado ou sem a permissão necessária retorna 404 para não revelar a existência de
recursos de outro workspace.

## Fluxo frontend → banco

| Área da interface     | Cliente                | Rotas backend         | Repositório                         |
| --------------------- | ---------------------- | --------------------- | ----------------------------------- |
| Login/cadastro        | `lib/api/auth.ts`      | `auth.routes.ts`      | `auth/authentication.ts`            |
| Board inicial         | `lib/api/board.ts`     | `workspace.routes.ts` | `workspace/repository.ts`           |
| Workspace e agregados | `lib/api/workspace.ts` | `workspace.routes.ts` | `workspace/workspace-repository.ts` |
| Tarefas e detalhes    | `lib/api/task.ts`      | `task.routes.ts`      | `workspace/task-repository.ts`      |
| Perfil e preferências | `lib/api/profile.ts`   | `profile.routes.ts`   | `workspace/repository.ts`           |
| Convites              | `lib/api/invite.ts`    | `invite.routes.ts`    | `workspace/invites.ts`              |
| Auditoria             | `lib/api/audit.ts`     | `workspace.routes.ts` | `workspace/audit-repository.ts`     |

## Correções feitas durante o mapeamento

- Criação de workspace passou a aguardar o banco e só então navegar com o UUID definitivo.
- `Profile.id` passou a transportar o ID real do usuário até o frontend.
- Atividades otimistas usam o nome do perfil autenticado, em vez do texto fixo “Você”.
- A criação continua desabilitada enquanto a requisição está em andamento e apresenta falha
  sem fechar o formulário.
- Etiquetas, sprints e campos personalizados são criados primeiro no servidor; a interface
  nunca trabalha com IDs provisórios desses recursos.
- A posição do cartão é persistida por coluna e reordenada em uma única transação.
- O Board pagina tarefas em lotes de 100 e recebe invalidações em tempo real por SSE.
- Anexos de até 10 MB ficam no PostgreSQL e respeitam a autorização da tarefa.
- A auditoria registra alterações de workspace, tarefas, anexos, etiquetas, sprints, campos,
  documentos, metas, membros e convites; edições e movimentações de tarefa podem ser desfeitas.

## Lacunas que ainda não devem ser apresentadas como integração real

- O catálogo de integrações persiste nome, categoria e configuração, mas não executa OAuth,
  webhooks nem sincronização com Slack, GitHub, Google etc. Cada conector precisa de
  credenciais, callback, criptografia dos segredos e worker próprios.
- Recuperação de senha mantém resposta neutra, mas ainda não envia e-mail nem cria token.
- Convites geram e copiam um link; não existe provedor de e-mail para entrega automática.
  Essas três áreas são limitações explícitas. O restante do board não deve usar dados mockados
  em runtime; persistência e isolamento precisam ser validados pelo roteiro
  `docs/mvp/validacao-dois-usuarios.md`.
