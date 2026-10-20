import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";

const root = resolve(import.meta.dirname, "..");
const paths = {
  legacy: resolve(root, ".env"),
  development: resolve(root, ".env.development"),
  production: resolve(root, ".env.production"),
  frontendDevelopment: resolve(root, "../frontend/.env.development"),
  frontendProduction: resolve(root, "../frontend/.env.production"),
};

function readEnv(path) {
  return existsSync(path) ? parse(readFileSync(path)) : {};
}

function generated(existing, name, encoding = "base64") {
  return existing[name] || randomBytes(32).toString(encoding);
}

function serialize(values, sections) {
  const lines = ["# Gerado por: bun run env:prepare", "# Nunca envie este arquivo ao Git.", ""];
  for (const section of sections) {
    lines.push(`# ${section.title}`);
    for (const name of section.names) lines.push(`${name}=${JSON.stringify(values[name] ?? "")}`);
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

const sections = [
  {
    title: "Aplicação e banco",
    names: [
      "NODE_ENV",
      "DATABASE_URL",
      "TEST_DATABASE_URL",
      "APP_ORIGIN",
      "TRUSTED_PROXY_HEADER",
      "PORT",
    ],
  },
  {
    title: "Redis REST",
    names: [
      "REDIS_URL",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "KV_REST_API_URL",
      "KV_REST_API_TOKEN",
    ],
  },
  {
    title: "Google",
    names: [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_REDIRECT_URI",
      "GOOGLE_CALENDAR_REDIRECT_URI",
      "GOOGLE_TOKEN_ENCRYPTION_KEY",
    ],
  },
  { title: "OpenAI", names: ["OPENAI_API_KEY", "OPENAI_MODEL"] },
  {
    title: "GitHub App",
    names: [
      "GITHUB_APP_ID",
      "GITHUB_APP_SLUG",
      "GITHUB_APP_PRIVATE_KEY_BASE64",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "GITHUB_SETUP_URL",
      "GITHUB_OAUTH_CALLBACK_URL",
      "GITHUB_WEBHOOK_SECRET",
    ],
  },
  { title: "Web Push", names: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] },
  {
    title: "Criptografia",
    names: ["TWO_FACTOR_ENCRYPTION_KEY", "VAULT_ENCRYPTION_KEY", "CONTENT_ENCRYPTION_KEY"],
  },
];

const legacy = readEnv(paths.legacy);
const currentDevelopment = readEnv(paths.development);
const development = { ...legacy, ...currentDevelopment, NODE_ENV: "development" };
writeFileSync(paths.development, serialize(development, sections), { mode: 0o600 });

const currentProduction = readEnv(paths.production);
const production = {
  NODE_ENV: "production",
  DATABASE_URL: currentProduction.DATABASE_URL ?? "",
  TEST_DATABASE_URL: "",
  APP_ORIGIN: "https://tasks.grupoautoma.com",
  TRUSTED_PROXY_HEADER: currentProduction.TRUSTED_PROXY_HEADER || "x-forwarded-for",
  PORT: currentProduction.PORT || "4000",
  REDIS_URL: currentProduction.REDIS_URL ?? "",
  UPSTASH_REDIS_REST_URL: currentProduction.UPSTASH_REDIS_REST_URL ?? "",
  UPSTASH_REDIS_REST_TOKEN: currentProduction.UPSTASH_REDIS_REST_TOKEN ?? "",
  KV_REST_API_URL: currentProduction.KV_REST_API_URL ?? "",
  KV_REST_API_TOKEN: currentProduction.KV_REST_API_TOKEN ?? "",
  GOOGLE_CLIENT_ID: currentProduction.GOOGLE_CLIENT_ID || development.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET:
    currentProduction.GOOGLE_CLIENT_SECRET || development.GOOGLE_CLIENT_SECRET || "",
  GOOGLE_REDIRECT_URI: "https://tasks.grupoautoma.com/api/auth/google/callback",
  GOOGLE_CALENDAR_REDIRECT_URI:
    "https://tasks.grupoautoma.com/api/integrations/google-calendar/callback",
  GOOGLE_TOKEN_ENCRYPTION_KEY: generated(currentProduction, "GOOGLE_TOKEN_ENCRYPTION_KEY"),
  OPENAI_API_KEY: currentProduction.OPENAI_API_KEY || development.OPENAI_API_KEY || "",
  OPENAI_MODEL: currentProduction.OPENAI_MODEL || development.OPENAI_MODEL || "gpt-5.6-luna",
  GITHUB_APP_ID: currentProduction.GITHUB_APP_ID || development.GITHUB_APP_ID || "",
  GITHUB_APP_SLUG:
    currentProduction.GITHUB_APP_SLUG || development.GITHUB_APP_SLUG || "automa-tasks",
  GITHUB_APP_PRIVATE_KEY_BASE64:
    currentProduction.GITHUB_APP_PRIVATE_KEY_BASE64 ||
    development.GITHUB_APP_PRIVATE_KEY_BASE64 ||
    "",
  GITHUB_CLIENT_ID: currentProduction.GITHUB_CLIENT_ID || development.GITHUB_CLIENT_ID || "",
  GITHUB_CLIENT_SECRET:
    currentProduction.GITHUB_CLIENT_SECRET || development.GITHUB_CLIENT_SECRET || "",
  GITHUB_SETUP_URL: "https://tasks.grupoautoma.com/api/integrations/github/setup",
  GITHUB_OAUTH_CALLBACK_URL: "https://tasks.grupoautoma.com/api/integrations/github/oauth-callback",
  GITHUB_WEBHOOK_SECRET: generated(currentProduction, "GITHUB_WEBHOOK_SECRET", "hex"),
  VAPID_PUBLIC_KEY: currentProduction.VAPID_PUBLIC_KEY || development.VAPID_PUBLIC_KEY || "",
  VAPID_PRIVATE_KEY: currentProduction.VAPID_PRIVATE_KEY || development.VAPID_PRIVATE_KEY || "",
  VAPID_SUBJECT: currentProduction.VAPID_SUBJECT || "mailto:contato@grupoautoma.com",
  TWO_FACTOR_ENCRYPTION_KEY: generated(currentProduction, "TWO_FACTOR_ENCRYPTION_KEY"),
  VAULT_ENCRYPTION_KEY: generated(currentProduction, "VAULT_ENCRYPTION_KEY"),
  CONTENT_ENCRYPTION_KEY: generated(currentProduction, "CONTENT_ENCRYPTION_KEY"),
};
writeFileSync(paths.production, serialize(production, sections), { mode: 0o600 });
writeFileSync(
  paths.frontendDevelopment,
  '# Desenvolvimento: o Vite encaminha /api para o Fastify local.\nVITE_API_TARGET="http://localhost:4000"\n',
  { mode: 0o600 },
);
writeFileSync(
  paths.frontendProduction,
  "# Produção usa /api na mesma origem de https://tasks.grupoautoma.com.\n# Nenhuma variável pública ou segredo é necessário no bundle.\n",
  { mode: 0o600 },
);

const missing = [];
if (!production.DATABASE_URL) missing.push("DATABASE_URL");
const hasLocalRedis = production.REDIS_URL;
const hasUpstash = production.UPSTASH_REDIS_REST_URL && production.UPSTASH_REDIS_REST_TOKEN;
const hasKv = production.KV_REST_API_URL && production.KV_REST_API_TOKEN;
if (!hasLocalRedis && !hasUpstash && !hasKv) {
  missing.push("REDIS_URL, UPSTASH_REDIS_REST_URL/TOKEN ou KV_REST_API_URL/TOKEN");
}

console.log(
  "Arquivos de desenvolvimento e produção do backend/frontend preparados sem exibir segredos.",
);
if (missing.length) console.log(`Pendências externas de produção: ${missing.join(", ")}.`);
