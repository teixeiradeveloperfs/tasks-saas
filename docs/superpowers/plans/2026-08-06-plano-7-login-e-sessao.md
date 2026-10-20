# Plano 7 — Login, sessão e acesso persistente

**Objetivo:** garantir que uma pessoa consiga entrar, seja levada à rota que tentou abrir e veja apenas dados persistidos do próprio usuário.

## Diagnóstico atual

- A rota `/login` já existia e chamava `signIn` corretamente.
- Faltava preservar `?redirect=...` ao redirecionar depois do login.
- Faltava impedir que uma sessão ativa abrisse novamente a tela de login.
- A rota `_authed` já faz a guarda e hidrata o board, mas o store ainda contém constantes antigas de seed que precisam ser removidas completamente.
- A proteção real das mutações está nos middlewares `requireSession`; a proteção da navegação é apenas uma experiência de uso.
- `/forgot-password` ainda é apenas uma tela visual: não há fluxo de envio, token ou troca de senha.
- O bloqueio por tentativas existe no usuário, mas precisa de teste de integração e rate limit específico para login.

## Implementação feita nesta etapa

1. Atualizar `/login` para validar o search `redirect`.
2. Consultar `me()` antes de renderizar a tela e redirecionar sessões já autenticadas.
3. Após login bem-sucedido, navegar para a origem solicitada ou `/`.
4. Regenerar a árvore de rotas e validar o build.

## Próximas tarefas

### 7.1 — Testes da rota de login

- Testar credenciais inválidas sem revelar se o e-mail existe.
- Testar credenciais válidas e criação do cookie `flow_session`.
- Testar redirecionamento para `/workspace/...` após login.
- Testar que usuário autenticado não permanece em `/login`.
- Testar que sessão revogada ou expirada retorna para `/login`.

### 7.2 — Sessão e concorrência

- Manter a renovação deslizante sem trocar o token durante leituras normais.
- Testar duas leituras simultâneas da mesma sessão.
- Garantir rotação no login e revogação do token anterior.
- Confirmar atributos do cookie: `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` apenas em produção.

### 7.3 — Remover estado falso

- Remover `seedWorkspaces`, `seedTasks`, `defaultProfile` e o bloco legado de persistência do `src/lib/store.ts`.
- Inicializar o store vazio até o loader autenticado concluir.
- Usar `useProfile()` nas telas autenticadas.
- Remover a segunda busca do board no `AppShell`; o loader de `_authed` deve ser a única hidratação inicial.

### 7.4 — Proteção contra abuso

- Aplicar rate limit específico por IP e por e-mail normalizado na função `signIn`.
- Manter resposta genérica para credenciais inválidas e conta bloqueada.
- Testar desbloqueio após o período configurado.

### 7.5 — Recuperação de senha

- Criar tabela/token de recuperação com expiração, uso único e hash do token.
- Criar envio por provedor de e-mail configurado.
- Criar rota de redefinição e invalidar sessões após troca de senha.
- Até isso existir, `/forgot-password` deve deixar claro que o recurso ainda não está operacional.

## Critérios de aceite

- Usuário deslogado não vê workspaces, tarefas ou perfil de seed.
- Abrir uma rota protegida leva a `/login?redirect=...`.
- Login válido retorna exatamente à rota original.
- Recarregar a página mantém a sessão e os eventos vindos do banco.
- Login inválido não cria sessão nem expõe informação sobre a conta.
- `npm test`, `npx tsc --noEmit` e `npm run build` passam sem erros novos.
