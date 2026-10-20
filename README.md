# Taskora

Taskora é uma plataforma multi-tenant para gestão de tarefas, equipes e projetos de várias empresas. Cada empresa pode ter workspaces, projetos, quadros Kanban, sprints, documentos, runbooks, automações, integrações e permissões próprias.

Este monorepo é conectado ao Lovable. Não faça force push, rebase, amend ou squash de commits que já foram publicados na branch conectada.

## Screenshots

Algumas telas principais do Taskora em execução:

| Dashboard | Board |
| --- | --- |
| ![Dashboard](docs/screenshots/01-dashboard.png) | ![Board](docs/screenshots/02-board.png) |

| Docs | Runbooks |
| --- | --- |
| ![Docs](docs/screenshots/03-docs.png) | ![Runbooks](docs/screenshots/04-runbooks.png) |

| Sprints | Quadros |
| --- | --- |
| ![Sprints](docs/screenshots/05-sprints.png) | ![Quadros](docs/screenshots/06-quadros.png) |

## Funcionalidades

- Workspaces isolados por empresa
- Projetos, quadros Kanban, tarefas, subtarefas e dependências
- Labels, sprints, metas, campos personalizados e auditoria
- Compartilhamento seletivo, runbooks e quadros brancos
- Google Calendar/Meet, GitHub, IA e Web Push
- Sessões seguras e 2FA opcional por TOTP
- Vault com valores sensíveis criptografados

## Arquitetura

~~~text
Navegador
   |
   +-- Nginx HTTPS e arquivos estáticos
   |      +-- frontend/dist -> SPA Vite
   |      +-- 127.0.0.1:3098 -> Fastify + Prisma
   |                                  +-- PostgreSQL
   |                                  +-- Redis/Upstash
   |
   +-- Desenvolvimento: Vite :5173 -> Fastify :4000
~~~

| Pacote | Responsabilidade |
| --- | --- |
| frontend/ | SPA React, Vite, TanStack Router, Tailwind e UI |
| backend/ | API Fastify, autenticação, autorização, Prisma e integrações |
| shared/ | Modelos de domínio e contratos Zod compartilhados |

O navegador usa /api na mesma origem. Em desenvolvimento o Vite faz o proxy; em produção o Nginx faz esse papel. Isso preserva o cookie de sessão e evita CORS entre frontend e API.

## Requisitos

Desenvolvimento: Node.js 22+, Bun 1.4+, Docker Compose e Git.

Produção: Ubuntu 22.04/24.04, Node.js 22+, Bun, PM2, Nginx, PostgreSQL, Redis e um domínio apontado para o servidor.

## Desenvolvimento local

~~~bash
git clone <URL_DO_REPOSITORIO> taskora
cd taskora
bun install --frozen-lockfile
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
~~~

Configure backend/.env:

~~~env
NODE_ENV="development"
DATABASE_URL="postgresql://flow:flow_dev_local@localhost:5433/flow_dev?schema=public"
TEST_DATABASE_URL="postgresql://flow:flow_dev_local@localhost:5433/flow_test?schema=public"
APP_ORIGIN="http://localhost:5173"
PORT="4000"
~~~

Gere as chaves criptográficas com openssl rand -base64 32. Use uma chave diferente para TWO_FACTOR_ENCRYPTION_KEY, VAULT_ENCRYPTION_KEY e CONTENT_ENCRYPTION_KEY. Nunca publique arquivos .env ou chaves no Git.

### Banco local

~~~bash
docker compose -f backend/docker-compose.yml up -d
bun run db:generate
bun run db:migrate
bun run db:migrate:test
# opcional: bun run db:seed
~~~

O PostgreSQL local usa a porta 5433 para não conflitar com uma instalação na porta 5432.

### Executar

~~~bash
bun run dev
~~~

- Frontend: http://localhost:5173
- API: http://localhost:4000
- Sessão: http://localhost:4000/api/session/me

### Comandos

| Comando | Descrição |
| --- | --- |
| bun run dev | Inicia frontend e backend |
| bun run build | Gera backend e frontend |
| bun run build:production | Build de produção |
| bun run test | Executa os testes |
| bun run lint | Executa o ESLint |
| bun run format | Formata com Prettier |
| bun run db:migrate | Aplica migrations |
| bun run db:migrate:test | Aplica migrations de teste |
| bun run db:seed | Carrega dados de demonstração |
| bun run db:studio | Abre o Prisma Studio |
| bun run pm2:start | Inicia a API no PM2 |
| bun run pm2:reload | Recarrega a API no PM2 |
| bun run pm2:stop | Para a API no PM2 |

## Variáveis de ambiente

Backend: DATABASE_URL, TEST_DATABASE_URL, APP_ORIGIN, TRUSTED_PROXY_HEADER, PORT, REDIS_URL ou credenciais Upstash/KV, GOOGLE_*, OPENAI_*, GITHUB_*, VAPID_* e as chaves TWO_FACTOR_ENCRYPTION_KEY, VAULT_ENCRYPTION_KEY e CONTENT_ENCRYPTION_KEY.

Use backend/.env.production.example como base. Em produção, mantenha o arquivo com permissão 600 e nunca coloque secrets no ecosystem.

Frontend:

~~~env
VITE_API_TARGET="http://localhost:4000"
~~~

Essa variável só é usada pelo proxy do Vite. O build de produção usa /api na mesma origem.

## Segurança

- Sessão em cookie httpOnly, secure e sameSite=lax em produção
- CORS limitado a APP_ORIGIN e verificação de Origin em mutações
- Rate limit de login e ações sensíveis
- Autorização por workspace, projeto e recurso
- Conteúdo sensível criptografado antes de persistir
- 2FA opcional; quando ativado, ações sensíveis exigem confirmação recente

Para dados legados após configurar a criptografia:

~~~bash
bun run security:migrate-sensitive-data
~~~

## Deploy manual com Nginx e PM2

Exemplos: domínio app.exemplo.com, projeto /var/www/taskora, API 127.0.0.1:3098 e usuário deploy.

### 1. Preparar o servidor

~~~bash
sudo apt update
sudo apt install -y nginx git curl build-essential
curl -fsSL https://bun.sh/install | bash
sudo npm install -g pm2
~~~

Instale Node.js 22 pelo método oficial da sua distribuição e confirme node, bun, pm2 e nginx.

### 2. Instalar e configurar

~~~bash
sudo mkdir -p /var/www/taskora
sudo chown -R "$USER":"$USER" /var/www/taskora
git clone <URL_DO_REPOSITORIO> /var/www/taskora
cd /var/www/taskora
bun install --frozen-lockfile
cp backend/.env.production.example backend/.env.production
chmod 600 backend/.env.production
~~~

Preencha backend/.env.production com domínio, banco, Redis, OAuth e chaves. O ecosystem usa a porta 3098.

### 3. Banco e build

~~~bash
bun run db:generate
bun run db:migrate
bun run build:production
~~~

Não execute db:seed em produção sem confirmar que os dados podem ser substituídos.

### 4. PM2

O ecosystem configura processo único em fork, restart automático, limite de memória e porta 3098. O processo é único porque o backend inicia um scheduler interno.

~~~bash
bun run pm2:start
pm2 status
pm2 logs taskora-api
pm2 save
pm2 startup
~~~

Execute o comando adicional impresso por pm2 startup e depois rode pm2 save novamente.

### 5. Nginx

Crie /etc/nginx/sites-available/taskora:

~~~nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.exemplo.com;

    root /var/www/taskora/frontend/dist;
    index index.html;
    client_max_body_size 25m;

    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    location /api/ {
        proxy_pass http://127.0.0.1:3098;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        proxy_buffering off;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
~~~

No bloco http de /etc/nginx/nginx.conf:

~~~nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
~~~

Ative e valide:

~~~bash
sudo ln -s /etc/nginx/sites-available/taskora /etc/nginx/sites-enabled/taskora
sudo nginx -t
sudo systemctl reload nginx
~~~

### 6. HTTPS

~~~bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.exemplo.com
~~~

Depois ajuste APP_ORIGIN para https://app.exemplo.com e execute bun run pm2:reload.

## Deploy automático por GitHub Actions

Crie os secrets DEPLOY_HOST, DEPLOY_USER, DEPLOY_PATH, DEPLOY_SSH_KEY e DEPLOY_PORT. A chave pública deve estar no authorized_keys do usuário de deploy.

Crie .github/workflows/deploy.yml:

~~~yaml
name: Deploy Taskora

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: taskora-production
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Atualizar servidor
        uses: appleboy/ssh-action@v1.2.2
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          port: ${{ secrets.DEPLOY_PORT || 22 }}
          script_stop: true
          script: |
            set -eu
            cd "${{ secrets.DEPLOY_PATH }}"
            git fetch origin main
            git checkout main
            git pull --ff-only origin main
            bun install --frozen-lockfile
            bun run db:generate
            bun run db:migrate
            bun run build:production
            bun run pm2:reload || bun run pm2:start
            pm2 save
            curl --fail --silent --show-error http://127.0.0.1:3098/api/session/me >/dev/null
~~~

O deploy falha se migrations, build ou verificação final falharem. O --ff-only evita merges inesperados. Não use force push; para rollback, faça git revert ou redeploye um commit anterior validado.

## Verificação pós-deploy

~~~bash
pm2 status
pm2 logs taskora-api --lines 100
curl -I https://app.exemplo.com/
curl -i https://app.exemplo.com/api/session/me
~~~

A sessão deve responder 200 com authenticated false sem cookie. O frontend deve carregar e as requisições /api devem usar o mesmo domínio.

## Troubleshooting

### API não inicia

~~~bash
pm2 logs taskora-api
bun run db:generate
~~~

Confira DATABASE_URL, APP_ORIGIN, PORT e as chaves de criptografia.

### Nginx responde 502

~~~bash
pm2 status
curl -i http://127.0.0.1:3098/api/session/me
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
~~~

Se a API responde localmente, revise proxy_pass, firewall e a porta do ecosystem.

### Cookies não persistem

Confirme que o domínio público é igual a APP_ORIGIN, que o acesso usa HTTPS e que o Nginx envia X-Forwarded-Proto.

### Migração falhou

Não apague nem edite migrations já aplicadas. Corrija a causa com um novo commit e execute novamente bun run db:migrate.

## URLs de integrações

Substitua app.exemplo.com pelo domínio real:

~~~text
Google Login:    https://app.exemplo.com/api/auth/google/callback
Google Calendar: https://app.exemplo.com/api/integrations/google-calendar/callback
GitHub Setup:    https://app.exemplo.com/api/integrations/github/setup
GitHub OAuth:    https://app.exemplo.com/api/integrations/github/oauth-callback
GitHub Webhook:  https://app.exemplo.com/api/integrations/github/webhook
~~~

## Checklist antes de publicar

~~~bash
bun run lint
bun run build
bun run test
~~~

Não inclua credenciais, dumps de banco, arquivos .env, certificados ou chaves privadas nos commits.
