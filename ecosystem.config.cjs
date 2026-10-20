const path = require("node:path");

const rootDir = __dirname;

module.exports = {
  apps: [
    {
      name: "taskora-api",
      cwd: path.join(rootDir, "backend"),
      // Em workspaces instalados pelo Bun, o executável fica no node_modules
      // do pacote que declara a dependência, não necessariamente na raiz.
      script: path.join(rootDir, "backend", "node_modules", "tsx", "dist", "cli.mjs"),
      args: "src/server.ts",
      interpreter: "node",

      // O backend inicia agendadores internos. Mais de uma instância faria o
      // mesmo agendamento ser processado em paralelo.
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 2_000,
      max_memory_restart: "768M",
      kill_timeout: 10_000,
      listen_timeout: 10_000,

      time: true,
      merge_logs: true,

      env_production: {
        NODE_ENV: "production",
        // A porta 4000 já pertence ao CassinoTrack nesta VPS. O Nginx do
        // servidor principal acessa esta API pela rede privada.
        PORT: 3098,
      },
    },
  ],
};
