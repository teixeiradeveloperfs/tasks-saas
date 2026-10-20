#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/var/www/taskora}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

cd "$DEPLOY_PATH"

git fetch origin "$DEPLOY_BRANCH"
git checkout "$DEPLOY_BRANCH"
git pull --ff-only origin "$DEPLOY_BRANCH"

bun install --frozen-lockfile
bun run db:generate
bun run db:migrate
bun run build:production

bun run pm2:reload || bun run pm2:start
pm2 save

curl --fail --silent --show-error http://127.0.0.1:3098/api/session/me >/dev/null
echo "Taskora deploy concluído: $(git rev-parse --short HEAD)"
