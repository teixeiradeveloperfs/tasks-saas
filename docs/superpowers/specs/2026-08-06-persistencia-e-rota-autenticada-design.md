# Persistência de sessão e rota autenticada

**Data:** 2026-08-06
**Estado:** aprovado, pronto para plano de implementação
**Specs de referência:** `2026-08-04-identidade-e-acesso-design.md`
**Roteiro:** `2026-08-05-roteiro-mvp-multiusuario.md` — este documento executa parte de E5 e de E8

## Contexto

O relato que originou este documento foi **"as alterações não estão ficando salvas"**. A
investigação mostrou que não se trata de um bug de escrita: as 46 de 49 ações do store já
chamam o servidor e, com sessão válida, gravam e sobrevivem ao reload — verificado criando um
workspace pela interface e recarregando.

O sintoma vem de **três defeitos independentes que se encadeiam** e produzem, juntos, uma
aplicação que aparenta funcionar enquanto descarta tudo:

```
rotação de sessão revoga o cookie sem substituí-lo
        ↓  o usuário perde a sessão sem ser avisado
não existe guarda de rota
        ↓  a app monta normalmente mesmo sem sessão
o store nasce com dados-semente falsos
        ↓  a tela se parece com uma sessão legítima
o formulário guarda o valor em useState
        ↓  a edição continua na tela depois de o servidor recusar
```

### Evidência

| Verificação | Resultado |
| --- | --- |
| Sessão envelhecida além da metade do TTL | Primeira requisição já é rejeitada; todas as seguintes também. Permanente |
| Navegar deslogado para `/profile` | Renderiza a casca completa, sidebar com "Você · Product Manager", formulário preenchido com o seed |
| Salvar o perfil deslogado | O cabeçalho do card passa a exibir o valor novo. Nenhum aviso de erro. Nada gravado |
| Criar workspace **logado** | Funciona e sobrevive ao reload |
| Abrir um workspace do seed | "Workspace não encontrado" — `seed-acme` não existe no Postgres |

O contraste entre as duas últimas linhas é o diagnóstico: a escrita está correta; o que está
errado é o app fingir ter sessão e fingir ter dados.

## Decisões

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Renovação de sessão | **Expiração deslizante, sem troca de token** | Ver "Por que não rotacionar na leitura" |
| Estado inicial do store | Vazio, `profile: null` | Dado falso na tela é indistinguível de dado real |
| Momento da hidratação | No `loader` da rota `_authed` | Ver "Hidratar no loader, não no efeito" |
| Proteção de rota | Rota de layout `_authed` | Toda rota nova nasce protegida; mitigação do risco R2 |
| Helper `authedServerFn` | **Não implementar** | Ver "A armadilha do helper de proteção" |
| Google OAuth | `openid-client`, implementação adiada | Ver "Login pelo Google" |

### Por que não rotacionar na leitura

`readSession` hoje troca o token quando a sessão passa da metade do TTL: revoga o atual e cria
um substituto. Duas coisas quebram.

A primeira é que **ninguém escreve o cookie novo**. `writeSessionCookie` só é chamado em
`signUp`, `signIn` e `acceptInvite` — nunca no caminho de renovação. O navegador segue com um
token revogado, para sempre.

A segunda sobrevive mesmo depois de corrigida a primeira. A aplicação dispara várias server
functions em paralelo. A requisição A rotaciona e revoga o token T; a requisição B, emitida no
mesmo instante e carregando o mesmo T, encontra T morto e recebe 401. Escrever o cookie na
resposta de A não ajuda: B já estava em voo. Isso trocaria uma falha determinística no dia 15
por uma falha intermitente no dia 15, que é pior de diagnosticar.

A renovação passa a empurrar `expiresAt` e `lastUsedAt` mantendo o mesmo token. Sem token novo
não há cookie a reescrever nem corrida a perder.

**A rotação continua existindo onde defende algo:** `rotateLoginSession` no login, que é a
defesa contra fixação de sessão, e `revokeSession` no logout. Ambos já funcionam e não mudam.

**Custo assumido, explícito:** um token roubado passa a valer até 30 dias corridos, renovando
enquanto for usado, em vez de perder validade a cada 15 dias. É o comportamento padrão de
sessão deslizante. A mitigação real para token roubado é revogação — que já existe — e não um
prazo curto que, na implementação atual, desloga o usuário legítimo.

### Hidratar no loader, não no efeito

Hoje a hidratação vive num `useEffect` do `AppShell` (`:65-79`), e o `catch` dele tem o
comentário "Keep the local seed available when the database is offline in development". Ou
seja: **falha de carregamento é tratada exibindo dados falsos.** É exatamente o caminho que
produz a tela mentirosa quando a sessão morre.

A hidratação passa para o `loader` da rota `_authed`. O `loader` do TanStack Router bloqueia a
renderização dos filhos até resolver, então dentro de `_authed` os dados estão garantidos. Três
ganhos, e o terceiro é o que mais importa:

1. Não existe janela em que a tela renderiza sem dados — nem falsos, nem vazios.
2. Dispensa uma flag `hydrated` costurada pelos cinco arquivos que leem `profile`.
3. **Falha de carregamento vira falha visível**, não um seed silencioso.

`AppShell` deixa de buscar e passa a só ler o store.

Como `profile` no store é `Profile | null` mas dentro de `_authed` nunca é nulo, o acesso passa
por um hook `useProfile()` em `src/frontend/state/` que lança se for nulo. O invariante fica
declarado num lugar só, em vez de cinco `profile?.` que escondem o erro.

`Profile` **não tem campo `id`** — a chave estável do formulário é `profile.email`.

### A armadilha do helper de proteção

A spec de identidade (`:344`) recomenda "um helper `authedServerFn` que torna a proteção o
padrão e a exposição pública a exceção explícita". **Esse helper foi implementado e causou um
vazamento de servidor para o cliente.**

O padrão escrito era:

```ts
const createServerFn = (options) => createServerFnBase(options).middleware([requireSession]);
```

O compilador do TanStack Start só reconhece a cadeia direta `createServerFn(...).handler(...)`.
Com o factory no meio, ele deixa de remover os corpos dos `.handler` do bundle do cliente —
`current-user.ts` e os repositórios Prisma passaram a ser servidos ao navegador, e a rota `/`
quebrava com `AsyncLocalStorage is not a constructor`. Corrigido em 2026-08-06 inlinando
`.middleware([requireSession])` nas 30 funções afetadas.

**Este documento revoga aquela recomendação.** A metade aproveitável da ideia é o teste
enumerador — critério de aceite 13 da spec anterior, nunca implementado — que obtém a mesma
garantia sem tocar no compilador. Ele entra aqui.

## Escopo

### Entra

1. **Renovação de sessão por expiração deslizante**, substituindo a rotação na leitura.
2. **Fim dos dados-semente do store** — estado inicial vazio, remoção das constantes de seed e
   do bloco `persist` comentado.
3. **Correção do formulário de perfil**, que hoje pode gravar o seed por cima do perfil real.
4. **Rota de layout `_authed`** com guarda de navegação, hidratação no `loader` e retorno à
   origem após o login. Inclui a server function pública `me()` e o hook `useProfile()`.
5. **Teste enumerador** de server functions sem `requireSession`.
6. **Regra de ESLint** proibindo import direto de `@/lib/store` fora de `src/frontend/state/` —
   pendência da E5 e a outra metade da mitigação do risco R4.

### Fica de fora

| Fora do escopo | Motivo |
| --- | --- |
| Implementação do login pelo Google | Decisão registrada aqui; plano próprio |
| Backend de recuperação de senha | Depende de provedor de e-mail contratado |
| Autorização por workspace (E9) | Etapa própria, e a mais crítica do roteiro |
| Remover a leitura dupla de sessão | Ver "Dívida registrada" |
| Persistir integrações | `toggleIntegration` e `updateIntegrationConfig` seguem locais |

## Mudanças por arquivo

### `src/backend/auth/session.ts`

`readSession` deixa de chamar `rotateSession`. Passada a metade do TTL, atualiza `expiresAt` e
`lastUsedAt` na mesma linha e devolve o token recebido.

`rotateSession`, `revokeSession`, `revokeAllUserSessions` e `renewSession` permanecem sem
alteração. `renewSession` e `revokeAllUserSessions` seguem sem chamador — são as peças da
futura troca de senha e removê-las agora é trabalho a refazer.

### `src/lib/store.ts`

| Mudança | Detalhe |
| --- | --- |
| Estado inicial | `workspaces: []`, `tasks: []`, `profile: null` |
| Constantes de seed | `seedMembersAcme`, `seedMembersPersonal`, `seedWorkspaces`, `seedTasks`, `defaultProfile` — removidas |
| Bloco `persist` comentado | Removido (`:1641-1701`) |

`profile` passa a ser `Profile | null`. O tipo muda, então todo consumidor é revisitado pelo
compilador. São cinco: `app-shell.tsx`, `task-dialog.tsx`, `inbox.tsx`, `index.tsx` e
`profile.tsx`. Todos vivem sob `_authed` e passam a usar o hook `useProfile()`.

### `src/routes/profile.tsx`

O formulário recebe `key={profile.email}`, remontando se o perfil trocar. Como ele só renderiza
depois do `loader` de `_authed`, o `useState` inicializa com o dado verdadeiro na primeira e
única montagem — a captura de estado obsoleto some pela raiz, sem `useEffect` de sincronia.

O texto "Tudo fica salvo neste navegador" é corrigido — é herança da era do `localStorage` e
hoje afirma o contrário do que o sistema faz.

**A verificar durante a implementação:** ao salvar deslogado, nenhum aviso de erro apareceu na
tela. O `writeThrough` chama `toast.error` no `catch`. Não foi apurado se o `Toaster` está
montado nessa rota ou se a promessa não rejeitou. A implementação deve confirmar que a falha
de escrita produz aviso visível.

### `src/routes/` — rota de layout

Nova `_authed.tsx` com duas responsabilidades:

- `beforeLoad` chama a nova server function `me()` e redireciona para `/login?redirect=<origem>`
  quando não há sessão. `me()` é pública de propósito — precisa responder "não autenticado" em
  vez de lançar 401, senão não dá para distinguir "sem sessão" de "erro de rede".
- `loader` chama `getBoardData()` e hidrata o store antes de renderizar os filhos.

Passam a ficar sob ela: `index`, `inbox`, `calendar`, `profile` e as dez
`workspace.$workspaceId.*`.

Seguem públicas: `login`, `signup`, `forgot-password`, `invite.$token`.

`/login` ganha redirecionamento para `/` quando já há sessão, e honra o parâmetro `redirect`.

**Lembrete que não muda:** com `ssr: false`, `beforeLoad` roda no navegador. Isto é experiência
de uso. A proteção real continua sendo `requireSession` no servidor.

### Teste enumerador

Percorre os módulos de `src/backend/functions/`, coleta as server functions exportadas e falha
se alguma não declarar `requireSession`. A lista de exceções — `signUp`, `signIn`, `signOut`,
`readInvite`, `acceptInvite` — é explícita no teste, de modo que tornar uma função pública
exija editar o teste conscientemente.

## Login pelo Google

Pesquisa feita em 2026-08-06. **A recomendação mudou em relação ao que seria intuitivo.**

| Opção | Veredito |
| --- | --- |
| `arctic` | **Descontinuada em julho de 2026.** A documentação do provider Google responde 404 |
| Lucia | Descontinuada em março de 2025; virou material didático |
| Better Auth | Vivo e é o sucessor recomendado, mas é framework completo: substituiria a tabela `Session`, o hash e o ciclo de vida que já funcionam |
| **`openid-client`** (panva) | **Escolhido.** OpenID Certified, mantido, roda em Node |

O argumento decisivo não é o fluxo OAuth, que é simples. É a **validação do ID token** —
assinatura contra as chaves do Google, `iss`, `aud`, `exp` e `nonce`. É a parte que falha em
silêncio quando escrita à mão, e onde "funciona nos meus testes" e "é seguro" não são a mesma
afirmação. A sessão continua própria; a biblioteca cobre apenas o handshake.

O callback é viável sem servidor à parte: esta versão do TanStack Start aceita `createFileRoute`
com a opção `server.handlers`, confirmado em
`node_modules/@tanstack/start-client-core/dist/esm/serverRoute.d.ts`.

### A decisão que fica em aberto

**O que acontece quando alguém entra pelo Google com um e-mail que já tem conta com senha.**

Vincular automaticamente é conveniente e é vetor de sequestro de conta se o provedor não
garantir que o e-mail foi verificado. As alternativas — recusar, ou exigir a senha antes de
vincular — trocam conveniência por segurança em graus diferentes. Isso precisa ser decidido no
brainstorming do plano dele, não improvisado na implementação.

`User.passwordHash` já é anulável, então contas exclusivamente do Google cabem no schema atual.
O que falta é onde guardar a identidade externa: colunas em `User` ou uma tabela de contas
vinculadas — decisão do plano próprio.

## Testes

| Nível | Cobre |
| --- | --- |
| Unidade | Sessão além da metade do TTL continua válida, mantém o mesmo token e tem `expiresAt` empurrado |
| Unidade | Duas leituras concorrentes da mesma sessão renovada continuam ambas válidas |
| Unidade | Sessão expirada e sessão revogada continuam sendo recusadas |
| Unidade | `me()` devolve não-autenticado sem lançar quando não há cookie |
| Componente | `useProfile()` lança quando o store ainda não hidratou |
| Estrutural | Teste enumerador de server functions sem `requireSession` |

O primeiro teste é o que teria pego o bug original: `session.test.ts` cobria `rotateSession`
isolado, nunca o disparo automático dentro de `readSession` nem a ida do cookie ao navegador.

Implementação por test-driven development: teste que falha antes do código que passa.

## Critérios de aceite

1. Sessão envelhecida além da metade do TTL continua funcionando, e o token no cookie não muda.
2. `expiresAt` da sessão renovada é maior que o anterior.
3. Requisições paralelas com a mesma sessão renovada não invalidam umas às outras.
4. Login continua revogando a sessão anterior.
5. `localStorage` vazio depois de uso normal.
6. Deslogado, navegar para `/`, `/inbox`, `/calendar`, `/profile` ou `/workspace/*` leva a
   `/login`; nenhum dado de workspace aparece na tela.
7. Após entrar, o usuário volta para a rota que tentou abrir.
8. Nenhuma tela exibe "Acme Inc.", "Projetos pessoais" ou "voce@flow.app" sem esses dados
   virem do banco.
9. O formulário de perfil, recém-carregado, mostra os dados do usuário autenticado.
10. Salvar o perfil sem alterar campo nenhum não muda nada no banco.
11. Uma escrita que falha produz aviso visível na tela.
12. O teste enumerador falha ao se remover `requireSession` de qualquer função protegida.
13. `npm test` passa inteiro.

## Riscos

**R1 — `profile: null` alcança consumidores não revisados.** A mudança de tipo faz o
compilador apontar cada um, mas um `profile!` ou `as Profile` em código existente esconderia a
falha até a execução. A revisão deve procurar por asserções de tipo, não confiar só no build.

**R2 — Renomear rotas para `_authed.*` invalida links salvos.** As URLs públicas não mudam —
`_authed` é um segmento de layout e não aparece no caminho. O risco real é `routeTree.gen.ts`
ficar dessincronizado; ele é gerado, e a verificação é o build passar.

**R3 — Sessão mais longa por padrão.** Consequência aceita e registrada acima. Reabrir se
houver relato de conta comprometida.

**R4 — O Lovable escreve neste repositório.** Segue valendo da spec anterior. O teste
enumerador é a defesa contra remoção silenciosa de `requireSession`; a regra de ESLint da E5
contra reintrodução de import direto de `@/lib/store`.

## Dívida registrada

**Leitura dupla de sessão por requisição.** `requireSession` lê a sessão e injeta `userId` no
contexto; o corpo do handler ignora o contexto e chama `currentUserId()`, que lê de novo. São
duas consultas e duas escritas de `lastUsedAt` por requisição autenticada.

Com a rotação corrigida isso deixa de ser causa de bug e passa a ser desperdício. Corrigir
exige passar `context.userId` em cerca de 45 pontos de chamada — mudança ampla, mecânica e sem
relação com os defeitos deste documento. Fica como passo separado, deliberadamente.
