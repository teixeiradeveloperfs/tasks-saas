import { z } from "zod";

// This module is reachable from createServerFn stubs in the browser bundle. Load
// dotenv only in a real Node process so its CLI parser never runs in the client.
if (typeof process !== "undefined" && process.release?.name === "node") {
  const { config } = await import("dotenv");
  const environment = process.env.NODE_ENV ?? "development";
  // Variáveis do processo têm prioridade; depois vem o arquivo específico e, por
  // último, o .env legado como fallback para instalações existentes.
  config({ path: [`.env.${environment}`, ".env"], quiet: true });
}

const emptyAsUndefined = z
  .string()
  .transform((value) => (value.trim() === "" ? undefined : value.trim()))
  .optional();

const httpOrigin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.host !== "";
  } catch {
    return false;
  }
}, "precisa ser uma origem http(s) completa, ex.: http://localhost:3000");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: emptyAsUndefined,
  APP_ORIGIN: httpOrigin,
  TRUSTED_PROXY_HEADER: emptyAsUndefined,
  PORT: z.coerce.number().int().positive().default(4000),
  REDIS_URL: emptyAsUndefined,
  UPSTASH_REDIS_REST_URL: emptyAsUndefined,
  UPSTASH_REDIS_REST_TOKEN: emptyAsUndefined,
  KV_REST_API_URL: emptyAsUndefined,
  KV_REST_API_TOKEN: emptyAsUndefined,
  GOOGLE_CLIENT_ID: emptyAsUndefined,
  GOOGLE_CLIENT_SECRET: emptyAsUndefined,
  GOOGLE_REDIRECT_URI: emptyAsUndefined,
  GOOGLE_CALENDAR_REDIRECT_URI: emptyAsUndefined,
  GOOGLE_TOKEN_ENCRYPTION_KEY: emptyAsUndefined,
  OPENAI_API_KEY: emptyAsUndefined,
  OPENAI_MODEL: emptyAsUndefined,
  GITHUB_APP_ID: emptyAsUndefined,
  GITHUB_APP_SLUG: emptyAsUndefined,
  GITHUB_APP_PRIVATE_KEY_BASE64: emptyAsUndefined,
  GITHUB_CLIENT_ID: emptyAsUndefined,
  GITHUB_CLIENT_SECRET: emptyAsUndefined,
  GITHUB_SETUP_URL: emptyAsUndefined,
  GITHUB_OAUTH_CALLBACK_URL: emptyAsUndefined,
  GITHUB_WEBHOOK_SECRET: emptyAsUndefined,
  VAPID_PUBLIC_KEY: emptyAsUndefined,
  VAPID_PRIVATE_KEY: emptyAsUndefined,
  VAPID_SUBJECT: emptyAsUndefined,
  TWO_FACTOR_ENCRYPTION_KEY: emptyAsUndefined,
  VAULT_ENCRYPTION_KEY: emptyAsUndefined,
  CONTENT_ENCRYPTION_KEY: emptyAsUndefined,
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);

  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Configuração de ambiente inválida:\n${fields}\n\n` +
        "Copie .env.example para .env e preencha as variáveis.",
    );
  }

  const env = result.data;
  const production = env.NODE_ENV === "production";

  if (production && new URL(env.APP_ORIGIN).protocol !== "https:") {
    throw new Error(
      "Configuração de ambiente inválida:\n" + "  APP_ORIGIN: precisa usar HTTPS em produção.",
    );
  }

  const incompleteUpstash =
    Boolean(env.UPSTASH_REDIS_REST_URL) !== Boolean(env.UPSTASH_REDIS_REST_TOKEN);
  const incompleteKv = Boolean(env.KV_REST_API_URL) !== Boolean(env.KV_REST_API_TOKEN);

  if (env.REDIS_URL) {
    try {
      const redisUrl = new URL(env.REDIS_URL);
      if (redisUrl.protocol !== "redis:" && redisUrl.protocol !== "rediss:") throw new Error();
    } catch {
      throw new Error(
        "Configuração de ambiente inválida:\n" + "  REDIS_URL: precisa usar redis:// ou rediss://.",
      );
    }
  }

  if (incompleteUpstash || incompleteKv) {
    throw new Error(
      "Configuração de ambiente inválida:\n" +
        "  Redis: URL e token precisam ser configurados em conjunto.\n\n" +
        "Use UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN ou KV_REST_API_URL/KV_REST_API_TOKEN.",
    );
  }

  const googleValues = [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI];
  if (googleValues.some(Boolean) && !googleValues.every(Boolean)) {
    throw new Error(
      "Configuração de ambiente inválida:\n" +
        "  Google OAuth: client id, client secret e redirect URI precisam ser configurados em conjunto.",
    );
  }

  if (env.GOOGLE_CALENDAR_REDIRECT_URI) {
    try {
      const redirect = new URL(env.GOOGLE_CALENDAR_REDIRECT_URI);
      if (redirect.protocol !== "http:" && redirect.protocol !== "https:") throw new Error();
    } catch {
      throw new Error(
        "Configuração de ambiente inválida:\n" +
          "  GOOGLE_CALENDAR_REDIRECT_URI: precisa ser uma URL HTTP(S) completa.",
      );
    }
  }

  if (env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    const key = Buffer.from(env.GOOGLE_TOKEN_ENCRYPTION_KEY, "base64");
    if (key.length !== 32) {
      throw new Error(
        "Configuração de ambiente inválida:\n" +
          "  GOOGLE_TOKEN_ENCRYPTION_KEY: precisa conter exatamente 32 bytes em base64.",
      );
    }
  }

  if (production && env.GOOGLE_CLIENT_ID && !env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    throw new Error(
      "Configuração de ambiente inválida:\n" +
        "  GOOGLE_TOKEN_ENCRYPTION_KEY: obrigatória em produção quando Google está habilitado.",
    );
  }

  for (const [name, value] of [
    ["TWO_FACTOR_ENCRYPTION_KEY", env.TWO_FACTOR_ENCRYPTION_KEY],
    ["VAULT_ENCRYPTION_KEY", env.VAULT_ENCRYPTION_KEY],
    ["CONTENT_ENCRYPTION_KEY", env.CONTENT_ENCRYPTION_KEY],
  ] as const) {
    if (!value) continue;
    const key = Buffer.from(value, "base64");
    if (key.length !== 32) {
      throw new Error(
        `Configuração de ambiente inválida:\n  ${name}: precisa conter exatamente 32 bytes em base64.`,
      );
    }
  }

  if (
    env.NODE_ENV === "production" &&
    (!env.TWO_FACTOR_ENCRYPTION_KEY || !env.VAULT_ENCRYPTION_KEY || !env.CONTENT_ENCRYPTION_KEY)
  ) {
    throw new Error(
      "Configuração de ambiente inválida:\n" +
        "  TWO_FACTOR_ENCRYPTION_KEY, VAULT_ENCRYPTION_KEY e CONTENT_ENCRYPTION_KEY são obrigatórias em produção.",
    );
  }

  if (env.GOOGLE_REDIRECT_URI) {
    try {
      const redirect = new URL(env.GOOGLE_REDIRECT_URI);
      if (redirect.protocol !== "http:" && redirect.protocol !== "https:") throw new Error();
    } catch {
      throw new Error(
        "Configuração de ambiente inválida:\n" +
          "  GOOGLE_REDIRECT_URI: precisa ser uma URL HTTP(S) completa.",
      );
    }
  }

  const githubValues = [
    env.GITHUB_APP_ID,
    env.GITHUB_APP_SLUG,
    env.GITHUB_APP_PRIVATE_KEY_BASE64,
    env.GITHUB_CLIENT_ID,
    env.GITHUB_CLIENT_SECRET,
  ];
  if (githubValues.some(Boolean) && !githubValues.every(Boolean)) {
    throw new Error(
      "Configuração de ambiente inválida:\n" +
        "  GitHub App: app id, slug, chave privada, client id e client secret precisam ser configurados em conjunto.",
    );
  }

  if (production && env.GITHUB_APP_ID && !env.GITHUB_WEBHOOK_SECRET) {
    throw new Error(
      "Configuração de ambiente inválida:\n" +
        "  GITHUB_WEBHOOK_SECRET: obrigatório em produção quando o GitHub App está habilitado.",
    );
  }

  for (const [name, value] of [
    ["GITHUB_SETUP_URL", env.GITHUB_SETUP_URL],
    ["GITHUB_OAUTH_CALLBACK_URL", env.GITHUB_OAUTH_CALLBACK_URL],
  ] as const) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch {
      throw new Error(
        `Configuração de ambiente inválida:\n  ${name}: precisa ser uma URL HTTP(S) completa.`,
      );
    }
  }

  if (production) {
    const appOrigin = new URL(env.APP_ORIGIN).origin;
    for (const [name, value] of [
      ["GOOGLE_REDIRECT_URI", env.GOOGLE_REDIRECT_URI],
      ["GOOGLE_CALENDAR_REDIRECT_URI", env.GOOGLE_CALENDAR_REDIRECT_URI],
      ["GITHUB_SETUP_URL", env.GITHUB_SETUP_URL],
      ["GITHUB_OAUTH_CALLBACK_URL", env.GITHUB_OAUTH_CALLBACK_URL],
    ] as const) {
      if (value && new URL(value).origin !== appOrigin) {
        throw new Error(
          `Configuração de ambiente inválida:\n  ${name}: precisa usar a mesma origem de APP_ORIGIN em produção.`,
        );
      }
    }
  }

  const vapidValues = [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT];
  if (vapidValues.some(Boolean) && !vapidValues.every(Boolean)) {
    throw new Error(
      "Configuração de ambiente inválida:\n" +
        "  Web Push: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT precisam ser configuradas em conjunto.",
    );
  }
  if (
    env.VAPID_SUBJECT &&
    !env.VAPID_SUBJECT.startsWith("mailto:") &&
    !env.VAPID_SUBJECT.startsWith("https://")
  ) {
    throw new Error(
      "Configuração de ambiente inválida:\n" +
        "  VAPID_SUBJECT: use mailto:contato@dominio.com ou uma URL HTTPS.",
    );
  }
  if (production && !vapidValues.every(Boolean)) {
    throw new Error(
      "Configuração de ambiente inválida:\n" +
        "  Web Push: as três configurações VAPID são obrigatórias em produção.",
    );
  }

  if (production && !env.TRUSTED_PROXY_HEADER) {
    throw new Error(
      "Configuração de ambiente inválida:\n" +
        "  TRUSTED_PROXY_HEADER: obrigatória quando NODE_ENV=production.\n\n" +
        "Sem ela o IP do cliente é forjável e o rate-limit não protege nada.",
    );
  }

  const hasSharedRateLimit =
    Boolean(env.REDIS_URL) ||
    Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) ||
    Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN);

  if (production && !hasSharedRateLimit) {
    throw new Error(
      "Configuração de ambiente inválida:\n" +
        "  Redis: obrigatório em produção para compartilhar o rate limit entre instâncias.\n\n" +
        "Configure REDIS_URL ou as credenciais REST do Redis no secret manager.",
    );
  }

  return env;
}

let cachedEnv: Env | undefined;

/** Lê e valida process.env uma vez, no primeiro acesso do servidor. */
export function getEnv(): Env {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}
