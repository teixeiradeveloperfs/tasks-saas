# Validação manual com dois usuários

## Objetivo

Comprovar, de forma reproduzível, que dois usuários sem convite entre si:

- possuem workspaces e tarefas isolados;
- não conseguem ler nem alterar recursos um do outro;
- recuperam seus próprios dados do servidor após recarregar a página e iniciar uma nova sessão.

Este roteiro não substitui testes automatizados de autorização. Ele é um gate manual do MVP e deve ser executado no mesmo artefato e banco que serão promovidos para produção.

## Evidências esperadas do código atual

- O cadastro cria automaticamente um workspace do usuário.
- A carga do board filtra workspaces pela associação em `WorkspaceMember`.
- As operações de workspace e tarefa exigem sessão e validam a associação do usuário; um recurso alheio deve responder como não encontrado, sem revelar se existe.
- A rota direta de um workspace ausente no board do usuário mostra `Workspace não encontrado`.
- A persistência válida deve vir do PostgreSQL após nova carga, e não apenas do estado em memória do navegador.

## Pré-requisitos

- [ ] Ambiente alvo iniciado com as migrations aplicadas.
- [ ] URL base registrada: `<URL_BASE>`.
- [ ] Duas janelas realmente isoladas: perfil normal e perfil convidado, ou dois perfis de navegador distintos.
- [ ] DevTools aberto nas duas janelas, aba **Network**, com `Preserve log` habilitado.
- [ ] Nenhum dos usuários foi convidado para o workspace do outro.
- [ ] Horário, versão/commit e responsável pelo teste registrados abaixo.

| Campo              | Valor |
| ------------------ | ----- |
| Ambiente           |       |
| URL base           |       |
| Commit/versão      |       |
| Data e hora        |       |
| Responsável        |       |
| Navegadores/perfis |       |

Use um sufixo único, por exemplo `20260806-1530`, em todos os nomes. Não use contas ou dados de clientes reais.

## Massa de teste

| Recurso             | Usuário A                          | Usuário B                          |
| ------------------- | ---------------------------------- | ---------------------------------- |
| Nome                | `QA A <sufixo>`                    | `QA B <sufixo>`                    |
| E-mail              | `qa+a-<sufixo>@example.test`       | `qa+b-<sufixo>@example.test`       |
| Senha               | senha exclusiva com 12+ caracteres | senha exclusiva com 12+ caracteres |
| Workspace explícito | `WS-A-<sufixo>`                    | `WS-B-<sufixo>`                    |
| Tarefa              | `TASK-A-<sufixo>`                  | `TASK-B-<sufixo>`                  |

Não registre as senhas neste documento nem em capturas de tela.

## 1. Criar e preparar o usuário A

1. No perfil de navegador A, abra `<URL_BASE>/signup`.
2. Cadastre o usuário A com a massa acima.
3. Confirme que o cadastro termina em uma área autenticada e que existe o workspace automático `QA A <sufixo> — Workspace`.
4. Na página inicial, clique em **Novo workspace**, informe `WS-A-<sufixo>` e uma descrição identificável, e conclua.
5. Copie da barra de endereço o valor após `/workspace/`; registre-o como `WORKSPACE_A_ID`.
6. Crie a tarefa `TASK-A-<sufixo>` com descrição, prioridade e prazo reconhecíveis.
7. Abra a tarefa e registre seu identificador como `TASK_A_ID`, caso ele esteja visível na requisição da aba Network.
8. Faça uma alteração não destrutiva na tarefa, como mudar a prioridade. Na aba Network, localize a requisição de atualização e salve-a como HAR ou use **Copy as fetch**. Essa requisição será usada somente no teste cruzado.

Resultado esperado: o workspace e a tarefa aparecem apenas na sessão A, sem erro de servidor.

## 2. Criar e preparar o usuário B

1. Sem encerrar ou reutilizar a janela A, abra `<URL_BASE>/signup` no perfil isolado B.
2. Cadastre o usuário B com a massa acima.
3. Confirme o workspace automático `QA B <sufixo> — Workspace`.
4. Crie o workspace `WS-B-<sufixo>` e registre o valor da URL como `WORKSPACE_B_ID`.
5. Crie a tarefa `TASK-B-<sufixo>` com valores diferentes dos usados por A.
6. Se disponível na aba Network, registre `TASK_B_ID`.

Resultado esperado: B vê somente seus workspaces e tarefas. `WS-A-<sufixo>` e `TASK-A-<sufixo>` não podem aparecer em dashboard, busca, calendário, inbox ou listas.

## 3. Confirmar isolamento de leitura

Execute nos dois sentidos.

### B tentando acessar A

1. Na janela B, abra diretamente `<URL_BASE>/workspace/<WORKSPACE_A_ID>`.
2. Confirme que nenhum nome, descrição, membro ou tarefa de A é renderizado.
3. Registre o status HTTP da navegação e uma captura da tela.
4. Volte para a página inicial de B e confirme que seus próprios dados continuam disponíveis.

### A tentando acessar B

1. Na janela A, abra diretamente `<URL_BASE>/workspace/<WORKSPACE_B_ID>`.
2. Confirme que nenhum dado de B é renderizado.
3. Registre o status HTTP e uma captura da tela.

Critério mínimo atual: a interface mostra `Workspace não encontrado` e não vaza nenhum dado. Para o deploy, é preferível que o boundary também responda com HTTP 404; se a tela mostrar a mensagem com HTTP 200, registre como endurecimento pendente, mesmo sem vazamento.

## 4. Confirmar isolamento de escrita

O objetivo é chamar, com a sessão B, uma operação válida que referencia uma tarefa de A. Não copie cookies, tokens ou headers de autenticação de A.

1. Continue na janela B e abra DevTools > Console.
2. Pegue a requisição de atualização não destrutiva capturada no passo 1.8 com **Copy as fetch**.
3. Confirme que o código copiado usa uma URL da própria aplicação e `credentials: "include"` ou o comportamento equivalente.
4. Remova do trecho qualquer header `cookie` que tenha sido incluído. O navegador deve anexar somente a sessão B.
5. Cole e execute o `fetch` na janela B, mantendo o identificador da tarefa A no payload.
6. Na aba Network, registre status e corpo da resposta.
7. Na janela A, recarregue a tarefa e confirme que nenhum novo efeito foi aplicado.
8. Repita no sentido inverso usando uma requisição não destrutiva de B executada na sessão A.

Resultado obrigatório:

- a operação cruzada falha como recurso não encontrado, preferencialmente HTTP 404;
- a resposta não informa nome, proprietário ou existência do recurso;
- a tarefa do proprietário permanece inalterada;
- não ocorre HTTP 500.

Se **Copy as fetch** não estiver disponível, exporte o HAR para identificar URL e payload e refaça a chamada pelo Console. Nunca execute a reprodução por `curl` com cookies copiados para arquivos ou histórico do terminal.

## 5. Confirmar persistência após reload

Execute separadamente para A e B.

1. No workspace próprio, altere o título ou a prioridade da tarefa e aguarde a requisição terminar com sucesso.
2. Faça um hard reload (`Ctrl+Shift+R`).
3. Confirme que workspace, tarefa e alteração continuam visíveis.
4. Feche a aba e abra novamente a URL do workspace.
5. Saia da conta, entre novamente e confirme os mesmos dados.
6. Reinicie apenas o processo da aplicação, sem reiniciar ou recriar o banco, e repita o login e a conferência.
7. Opcionalmente, consulte o PostgreSQL em modo somente leitura e confirme que cada workspace possui apenas o respectivo usuário em `WorkspaceMember` e que as tarefas apontam ao workspace correto.

Resultado obrigatório: os dados sobrevivem a hard reload, nova aba, logout/login e reinício do processo da aplicação. Se sobreviverem apenas enquanto a aba está aberta, a persistência falhou.

## 6. Confirmar separação de sessão

1. Com A e B autenticados, saia apenas na janela A.
2. Confirme que A é enviado para `/login` ao abrir uma rota protegida.
3. Recarregue a janela B e confirme que B continua autenticado.
4. Na janela A, tente abrir a URL de A sem autenticação e confirme o redirecionamento para `/login` com retorno à rota original após login válido.

Resultado esperado: logout e cookie de uma janela/perfil não afetam a outra sessão.

## Registro do resultado

| Caso                        | Resultado         | Evidência | Observação |
| --------------------------- | ----------------- | --------- | ---------- |
| Cadastro A e B              | ☐ passou ☐ falhou |           |            |
| Listagem isolada            | ☐ passou ☐ falhou |           |            |
| B abre URL de A             | ☐ passou ☐ falhou |           |            |
| A abre URL de B             | ☐ passou ☐ falhou |           |            |
| B tenta alterar tarefa de A | ☐ passou ☐ falhou |           |            |
| A tenta alterar tarefa de B | ☐ passou ☐ falhou |           |            |
| Persistência A              | ☐ passou ☐ falhou |           |            |
| Persistência B              | ☐ passou ☐ falhou |           |            |
| Logout isolado              | ☐ passou ☐ falhou |           |            |

## Critério de aprovação

O gate passa somente se todos os casos passarem e não houver vazamento de conteúdo, diferença de mensagem que revele a existência de recurso, mutação cruzada ou perda após reinício da aplicação. Qualquer falha de isolamento bloqueia o deploy; anexe HAR, captura, horário e versão à ocorrência sem incluir senhas ou cookies.
