# Checklist de deploy do MVP

## Como usar

Este checklist é um gate de produção. Cada item deve ter responsável e evidência verificável. Não marque como concluído com base apenas em configuração presumida pela plataforma.

| Campo                         | Valor |
| ----------------------------- | ----- |
| Ambiente                      |       |
| URL pública                   |       |
| Commit/artefato               |       |
| Responsável                   |       |
| Janela de deploy              |       |
| Banco/instância               |       |
| Versão anterior para rollback |       |

## Estado encontrado na auditoria

| Área            | Estado atual                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Env             | Produção exige banco, origem, proxy confiável e credenciais REST do Redis compartilhado                                                       |
| Runtime         | O artefato exige Node e falha cedo se for publicado como runtime edge                                                                         |
| Migrations      | Há migrations Prisma versionadas; o script do projeto usa `migrate dev`, inadequado para produção                                             |
| Banco           | PostgreSQL com healthcheck apenas no Compose de desenvolvimento                                                                               |
| Cookies         | Sessão `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` em produção; TTL de 30 dias                                                            |
| Proxy/IP        | O rate limit lê o último valor do header configurado como confiável                                                                           |
| Headers         | HSTS e `X-Frame-Options: DENY` em produção; CSP ainda é `Report-Only`                                                                         |
| CSRF            | Operações não seguras aceitam somente a origem igual a `APP_ORIGIN`                                                                           |
| Rate limit      | Login usa janela deslizante atômica no Redis compartilhado por e-mail normalizado e IP; memória é apenas fallback local                       |
| Healthcheck     | Não foi encontrada rota dedicada de liveness/readiness da aplicação                                                                           |
| Observabilidade | Erros de servidor usam `console.error`; existe captura do browser ligada ao ambiente Lovable, mas não há monitoramento de produção confirmado |
| Backup/rollback | Não foram encontrados scripts ou automação versionada para backup, restore ou rollback                                                        |

As lacunas acima não são automaticamente falhas do produto, mas precisam ser resolvidas ou formalmente aceitas antes do primeiro deploy.

## 1. Variáveis de ambiente e segredos

- [ ] `NODE_ENV=production` está definido no runtime.
- [ ] `DATABASE_URL` aponta para o banco de produção, nunca para `flow_dev` ou `flow_test`.
- [ ] A URL do banco exige TLS quando a conexão atravessa rede pública, conforme o provedor.
- [ ] `APP_ORIGIN` contém somente a origem pública canônica, com esquema e host corretos, por exemplo `https://app.exemplo.com`, sem path.
- [ ] `TRUSTED_PROXY_HEADER` é exatamente o header sobrescrito pelo proxy confiável, não um header repassado livremente do cliente.
- [ ] `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` estão no secret manager; alternativamente, o par `KV_REST_API_URL`/`KV_REST_API_TOKEN` está configurado.
- [ ] `TEST_DATABASE_URL` não aponta para produção; preferencialmente não existe no runtime de produção.
- [ ] Segredos estão no secret manager da plataforma, fora do repositório, logs e artefato.
- [ ] O usuário do banco tem somente os privilégios necessários para a aplicação e para o job controlado de migrations.
- [ ] A rotação de credenciais do banco foi testada e possui responsável.
- [ ] O processo recusa iniciar quando uma variável obrigatória é removida em staging.

Evidência: captura redigida da configuração, log de arranque sem valores secretos e teste negativo em staging.

## 2. Build, runtime e artefato

- [ ] Dependências são instaladas a partir do lockfile adotado pelo projeto, sem gerar um lockfile concorrente.
- [ ] `npm test`, checagem TypeScript, lint aplicável e `npm run build` passam no commit exato do deploy.
- [ ] O build usa o preset Nitro `node-server`.
- [ ] O runtime é Node.js 22+ e suporta Prisma sobre TCP e Argon2 nativo.
- [ ] O artefato é imutável e identificado por commit/tag.
- [ ] O mesmo artefato aprovado em staging é promovido para produção.
- [ ] Nenhum comando de seed é executado em produção.

Evidência: links dos jobs, digest/tag da imagem ou artefato e saída resumida das verificações.

## 3. Migrations

- [ ] Um backup recuperável é concluído antes da migration.
- [ ] `npx prisma migrate status` não aponta divergência ou migration falha.
- [ ] O plano foi revisado para locks, reescrita de tabela, índices e compatibilidade com a versão anterior da aplicação.
- [ ] Produção usa `npx prisma migrate deploy`; não usa `npm run db:migrate`/`prisma migrate dev`.
- [ ] Apenas uma instância/job aplica migrations, antes de liberar tráfego para a nova versão.
- [ ] A aplicação anterior continua compatível durante a janela necessária para rollback.
- [ ] O resultado é conferido na tabela `_prisma_migrations` e nos logs do job.
- [ ] Migration destrutiva ou irreversível possui estratégia expand/contract e ensaio de restore.

Evidência: log do job de migration, IDs aplicados, duração e referência do backup pré-deploy.

## 4. Banco de dados

- [ ] A versão do PostgreSQL é suportada pelo provedor, Prisma e adapter usados.
- [ ] Banco, schema e usuário de produção são exclusivos do ambiente.
- [ ] TLS, firewall/private network e allowlist estão configurados.
- [ ] Pool e limite de conexões suportam o número máximo de réplicas da aplicação.
- [ ] Storage, IOPS, CPU e conexões possuem alertas com folga definida.
- [ ] Timezone e relógio das instâncias estão sincronizados.
- [ ] Constraints, índices e cascatas esperados existem após as migrations.
- [ ] Uma consulta somente leitura confirma que produção não contém dados de seed (`Acme Inc.`/`Projetos pessoais`), salvo se inseridos intencionalmente.
- [ ] O usuário de teste e rotinas de teste não podem truncar o banco de produção.

Evidência: painel do banco, resultado redigido de migration/status e consulta de sanidade.

## 5. Cookies e sessão

- [ ] O site público responde exclusivamente por HTTPS.
- [ ] Após login, `flow_session` possui `HttpOnly`, `Secure`, `SameSite=Lax` e `Path=/`.
- [ ] O token não aparece em URL, HTML, storage do browser ou logs.
- [ ] Logout remove o cookie e revoga a sessão no banco.
- [ ] Cookie expirado/revogado leva a `/login` em rota protegida.
- [ ] Login cria/rotaciona a sessão e não aceita fixação de token anterior.
- [ ] A política de 30 dias de sessão foi aceita para o MVP.
- [ ] Existe rotina ou job definido para limpeza de sessões expiradas.

Evidência: DevTools com valor do cookie oculto e casos de login/logout/expiração.

## 6. Proxy, TLS e IP real

- [ ] O proxy termina TLS com certificado válido e redireciona HTTP para HTTPS.
- [ ] O proxy remove qualquer `TRUSTED_PROXY_HEADER` enviado pelo cliente e grava seu próprio valor.
- [ ] A escolha do último hop do header foi validada com a cadeia real de proxies/CDN.
- [ ] Requisição direta à aplicação, contornando o proxy, está bloqueada por rede.
- [ ] Limites de body, timeouts e keep-alive estão definidos.
- [ ] O IP observado nos logs/testes corresponde ao cliente esperado sem armazenar dado pessoal além do necessário.
- [ ] Todas as réplicas usam o mesmo banco Redis e o mesmo namespace de rate limit.

Evidência: configuração do proxy, teste com header forjado e registro do IP resolvido em staging.

## 7. Headers de segurança

Em produção, valide com `curl -I https://<host>/login` e em uma rota autenticada, sem registrar cookies.

- [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains` está presente e é compatível com todos os subdomínios.
- [ ] `X-Frame-Options: DENY` está presente.
- [ ] `X-Content-Type-Options: nosniff` está presente.
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` está presente.
- [ ] `Permissions-Policy` desabilita câmera, microfone, geolocalização e pagamento como esperado.
- [ ] `Content-Security-Policy-Report-Only` está presente.
- [ ] O risco de CSP somente em relatório foi aceito para o MVP, com destino e rotina de análise dos relatórios definidos; caso contrário, CSP bloqueante foi testada com nonces.
- [ ] O proxy/CDN não remove nem duplica headers de forma conflitante.

Evidência: saída redigida de `curl -I` e captura da aba Network.

## 8. CSRF e CORS/origem

- [ ] `APP_ORIGIN` coincide exatamente com a origem usada pelos usuários.
- [ ] Login e mutações legítimas funcionam pela origem canônica.
- [ ] Um POST com `Origin` de domínio diferente é rejeitado.
- [ ] Um POST sem origem, conforme os clientes realmente suportados, tem comportamento conhecido e aceito.
- [ ] Não há domínio alternativo, preview ou alias capaz de efetuar mutações em produção sem decisão explícita.
- [ ] Não foi habilitado CORS amplo no proxy.
- [ ] O fluxo de redirect do login aceita somente destinos internos; redirects absolutos ou iniciados por `//` são testados e bloqueados antes do deploy.

Evidência: requests da aba Network e testes negativos em staging. O último item é um teste de segurança obrigatório porque a rota de login recebe um parâmetro `redirect`.

## 9. Proteção de autenticação e abuso

- [ ] Cinco falhas bloqueiam temporariamente a conta conforme o comportamento atual, sem revelar se o e-mail existe.
- [ ] O bloqueio expira e um login válido zera os contadores.
- [ ] Existe rate limit específico para login por IP e identidade normalizada, ou o risco de depender apenas do limite amplo foi formalmente aceito.
- [ ] O limite amplo retorna HTTP 429 com `Retry-After`.
- [ ] Uma tentativa distribuída entre duas réplicas foi bloqueada pelo contador compartilhado no Redis.
- [ ] Indisponibilidade e latência do Redis possuem monitoramento; uma falha do store não deve passar silenciosamente como login permitido.
- [ ] Alertas detectam pico de falhas de login, 401, 404 de autorização e 429.

Evidência: teste controlado em staging e painel/consulta de eventos agregados sem senha.

## 10. Backups e restore

- [ ] Backups automáticos criptografados estão ativos com retenção definida.
- [ ] Point-in-time recovery está ativo, se oferecido pelo provedor.
- [ ] Existe backup manual identificado imediatamente antes do deploy/migration.
- [ ] Backups ficam em conta/local separado do banco principal e têm acesso restrito.
- [ ] RPO e RTO do MVP estão definidos e aceitos.
- [ ] Um restore recente foi ensaiado em banco isolado.
- [ ] O restore foi validado por contagem/sanidade de usuários, workspaces, membros e tarefas.
- [ ] Responsável e procedimento de acionamento fora do horário estão registrados.

Nunca teste restore sobre o banco de produção. Para PostgreSQL autogerenciado, use ferramentas como `pg_dump`/`pg_restore` com parâmetros vindos do secret manager e arquivos fora do repositório; em serviço gerenciado, prefira snapshots/PITR do provedor.

Evidência: ID/data do backup, relatório do último restore e RPO/RTO aprovados.

## 11. Healthcheck

- [ ] Existe liveness que confirma que o processo Node responde sem depender de autenticação.
- [ ] Existe readiness que só libera tráfego quando configuração e conexão mínima com o banco estão válidas.
- [ ] As rotas de health não expõem stack, env, URL do banco, versão interna ou dados de usuário.
- [ ] O orquestrador remove a instância após falhas consecutivas e respeita tempo de inicialização/migration.
- [ ] O banco possui healthcheck próprio.
- [ ] Um monitor externo testa HTTPS e uma jornada sintética de login/rota protegida com conta dedicada.

Lacuna atual: foi encontrado healthcheck do PostgreSQL no Compose de desenvolvimento, mas nenhuma rota dedicada da aplicação. Não use `/login` como readiness definitivo, pois ela pode responder mesmo com o banco degradado e ainda tem efeitos de sessão/SSR.

Evidência: URLs, configuração do orquestrador e histórico de um teste de falha controlada.

## 12. Observabilidade

- [ ] Logs do servidor são coletados centralmente com timestamp, ambiente, versão, request/correlation ID e severidade.
- [ ] Senhas, cookies, tokens, `DATABASE_URL` e corpos sensíveis são redigidos.
- [ ] Exceções SSR e rejeições não tratadas chegam ao monitoramento com stack e versão.
- [ ] A captura de erro do browser funciona fora do editor Lovable ou há um provedor explícito para produção.
- [ ] Métricas cobrem latência, throughput, 4xx/5xx, 429, disponibilidade, conexões e erros do banco.
- [ ] Alertas possuem limiar, canal, responsável e procedimento de resposta.
- [ ] Dashboard distingue falha de aplicação, proxy e banco.
- [ ] Retenção e acesso aos logs respeitam privacidade.

Lacuna atual: `console.error` existe como fallback, mas isso só é observabilidade se a plataforma coletar, reter e alertar sobre esses logs. A integração de captura do browser depende de `window.__lovableEvents` e deve ser comprovada no ambiente final.

Evidência: evento de teste localizado pelo correlation ID, dashboard e alerta recebido.

## 13. Validação funcional pré e pós-deploy

- [ ] O roteiro `docs/mvp/validacao-dois-usuarios.md` passou no artefato candidato.
- [ ] Cadastro, login, logout e retorno à rota original passaram.
- [ ] Criação/edição de workspace e tarefa persistem após hard reload e reinício da aplicação.
- [ ] Usuário não autenticado não acessa rotas protegidas.
- [ ] Isolamento de leitura e escrita entre dois usuários passou nos dois sentidos.
- [ ] Uma verificação pós-deploy confirma migrations, health, headers, login e persistência.
- [ ] Não há aumento inesperado de 5xx, latência ou falhas do banco durante a janela de observação.

## 14. Rollback

- [ ] A versão anterior do artefato continua disponível e identificada.
- [ ] O comando/procedimento de rollback da plataforma foi ensaiado em staging.
- [ ] Está definido quem decide o rollback e quais limiares o disparam.
- [ ] O rollback da aplicação não tenta desfazer migrations automaticamente.
- [ ] Migrations são compatíveis com a versão anterior ou há plano expand/contract.
- [ ] Se houver corrupção/perda de dados, o plano restaura o backup em uma nova instância, valida-o e só então troca a conexão/tráfego.
- [ ] Durante rollback, novas escritas são pausadas quando necessário para evitar divergência.
- [ ] Após rollback, health, login, isolamento e persistência são revalidados.
- [ ] Incidente, horários, decisão e impacto ficam registrados.

Sequência recomendada em incidente: congelar deploys, avaliar se há corrupção, retirar a nova versão, promover o artefato anterior, validar aplicação e banco, observar métricas e somente depois encerrar a janela. Se a migration não for retrocompatível, não faça downgrade cego: execute o plano de compatibilidade ou restauração previamente ensaiado.

## Aprovação final

| Gate                        | Responsável | Evidência | Aprovado |
| --------------------------- | ----------- | --------- | -------- |
| Build e testes              |             |           | ☐        |
| Env e segredos              |             |           | ☐        |
| Migration e banco           |             |           | ☐        |
| Segurança                   |             |           | ☐        |
| Backup e restore            |             |           | ☐        |
| Health e observabilidade    |             |           | ☐        |
| Validação com dois usuários |             |           | ☐        |
| Rollback ensaiado           |             |           | ☐        |

O deploy do MVP está liberado somente quando todos os gates obrigatórios têm responsável e evidência, e nenhuma falha de isolamento, persistência, backup/restore ou rollback permanece aberta.
