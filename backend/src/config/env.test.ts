import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/env";

const validEnv = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://flow:senha@localhost:5433/flow_dev?schema=public",
  TEST_DATABASE_URL: "postgresql://flow:senha@localhost:5433/flow_test?schema=public",
  APP_ORIGIN: "http://localhost:3000",
  TRUSTED_PROXY_HEADER: "",
  TWO_FACTOR_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
  VAULT_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString("base64"),
  CONTENT_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"),
};

const validProductionEnv = {
  ...validEnv,
  NODE_ENV: "production",
  APP_ORIGIN: "https://tasks.grupoautoma.com",
  TRUSTED_PROXY_HEADER: "x-forwarded-for",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "secret-token",
  VAPID_PUBLIC_KEY: "public-key",
  VAPID_PRIVATE_KEY: "private-key",
  VAPID_SUBJECT: "mailto:contato@grupoautoma.com",
};

describe("parseEnv", () => {
  it("aceita uma configuração completa de desenvolvimento", () => {
    const env = parseEnv(validEnv);
    expect(env.APP_ORIGIN).toBe("http://localhost:3000");
    expect(env.NODE_ENV).toBe("development");
  });

  it("assume development quando NODE_ENV está ausente", () => {
    const { NODE_ENV: _, ...withoutNodeEnv } = validEnv;
    expect(parseEnv(withoutNodeEnv).NODE_ENV).toBe("development");
  });

  it("recusa DATABASE_URL ausente, nomeando a variável", () => {
    const { DATABASE_URL: _, ...withoutDatabase } = validEnv;
    expect(() => parseEnv(withoutDatabase)).toThrow(/DATABASE_URL/);
  });

  it("recusa APP_ORIGIN que não é uma URL HTTP(S)", () => {
    expect(() => parseEnv({ ...validEnv, APP_ORIGIN: "localhost:3000" })).toThrow(/APP_ORIGIN/);
  });

  it("trata string vazia em TRUSTED_PROXY_HEADER como ausente", () => {
    expect(parseEnv(validEnv).TRUSTED_PROXY_HEADER).toBeUndefined();
  });

  it("exige TRUSTED_PROXY_HEADER em produção", () => {
    expect(() => parseEnv({ ...validProductionEnv, TRUSTED_PROXY_HEADER: "" })).toThrow(
      /TRUSTED_PROXY_HEADER/,
    );
  });

  it("aceita produção quando TRUSTED_PROXY_HEADER está preenchida", () => {
    const env = parseEnv(validProductionEnv);
    expect(env.TRUSTED_PROXY_HEADER).toBe("x-forwarded-for");
  });

  it("exige HTTPS na origem de produção", () => {
    expect(() =>
      parseEnv({ ...validProductionEnv, APP_ORIGIN: "http://tasks.grupoautoma.com" }),
    ).toThrow(/HTTPS/);
  });

  it("exige Redis compartilhado em produção", () => {
    expect(() =>
      parseEnv({
        ...validProductionEnv,
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
      }),
    ).toThrow(/Redis/);
  });

  it("aceita Redis local autenticado por URL em produção", () => {
    const env = parseEnv({
      ...validProductionEnv,
      REDIS_URL: "redis://default:secret@127.0.0.1:6380",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    });

    expect(env.REDIS_URL).toBe("redis://default:secret@127.0.0.1:6380");
  });

  it("recusa protocolo inválido em REDIS_URL", () => {
    expect(() => parseEnv({ ...validEnv, REDIS_URL: "http://127.0.0.1:6380" })).toThrow(
      /REDIS_URL/,
    );
  });

  it("recusa credenciais Redis incompletas", () => {
    expect(() =>
      parseEnv({ ...validEnv, UPSTASH_REDIS_REST_URL: "https://example.upstash.io" }),
    ).toThrow(/URL e token/);
  });

  it("exige as três configurações do Google OAuth em conjunto", () => {
    expect(() => parseEnv({ ...validEnv, GOOGLE_CLIENT_ID: "client-id" })).toThrow(/Google OAuth/);
    expect(
      parseEnv({
        ...validEnv,
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_REDIRECT_URI: "https://tasks.example.com/api/auth/google/callback",
      }).GOOGLE_REDIRECT_URI,
    ).toBe("https://tasks.example.com/api/auth/google/callback");
  });

  it("aceita a OpenAI opcional e normaliza valores vazios", () => {
    expect(parseEnv({ ...validEnv, OPENAI_API_KEY: "" }).OPENAI_API_KEY).toBeUndefined();
    expect(
      parseEnv({
        ...validEnv,
        OPENAI_API_KEY: "sk-test",
        OPENAI_MODEL: "gpt-5.6-luna",
      }),
    ).toMatchObject({ OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "gpt-5.6-luna" });
  });

  it("exige as credenciais do GitHub App em conjunto", () => {
    expect(() => parseEnv({ ...validEnv, GITHUB_APP_ID: "123" })).toThrow(/GitHub App/);
    expect(
      parseEnv({
        ...validEnv,
        GITHUB_APP_ID: "123",
        GITHUB_APP_SLUG: "automa-tasks",
        GITHUB_APP_PRIVATE_KEY_BASE64: Buffer.from("private-key").toString("base64"),
        GITHUB_CLIENT_ID: "Iv1.client",
        GITHUB_CLIENT_SECRET: "secret",
        GITHUB_SETUP_URL: "https://tasks.example.com/api/integrations/github/setup",
        GITHUB_OAUTH_CALLBACK_URL:
          "https://tasks.example.com/api/integrations/github/oauth-callback",
      }),
    ).toMatchObject({ GITHUB_APP_ID: "123", GITHUB_APP_SLUG: "automa-tasks" });
  });

  it("recusa URLs inválidas do GitHub App", () => {
    expect(() => parseEnv({ ...validEnv, GITHUB_SETUP_URL: "localhost/setup" })).toThrow(
      /GITHUB_SETUP_URL/,
    );
  });

  it("aceita overrides seguros do Google Calendar", () => {
    expect(
      parseEnv({
        ...validEnv,
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_REDIRECT_URI: "http://localhost/api/auth/google/callback",
        GOOGLE_CALENDAR_REDIRECT_URI: "http://localhost/callback",
        GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      }).GOOGLE_CALENDAR_REDIRECT_URI,
    ).toBe("http://localhost/callback");
    expect(() => parseEnv({ ...validEnv, GOOGLE_TOKEN_ENCRYPTION_KEY: "chave-curta" })).toThrow(
      /GOOGLE_TOKEN_ENCRYPTION_KEY/,
    );
  });

  it("exige chave independente do Calendar em produção", () => {
    expect(() =>
      parseEnv({
        ...validProductionEnv,
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_REDIRECT_URI: "https://tasks.grupoautoma.com/api/auth/google/callback",
      }),
    ).toThrow(/GOOGLE_TOKEN_ENCRYPTION_KEY/);
  });

  it("exige segredo de webhook quando o GitHub está habilitado em produção", () => {
    expect(() =>
      parseEnv({
        ...validProductionEnv,
        GITHUB_APP_ID: "123",
        GITHUB_APP_SLUG: "automa-tasks",
        GITHUB_APP_PRIVATE_KEY_BASE64: Buffer.from("private-key").toString("base64"),
        GITHUB_CLIENT_ID: "Iv1.client",
        GITHUB_CLIENT_SECRET: "secret",
      }),
    ).toThrow(/GITHUB_WEBHOOK_SECRET/);
  });

  it("exige configuração VAPID completa", () => {
    expect(() => parseEnv({ ...validEnv, VAPID_PUBLIC_KEY: "public-key" })).toThrow(/Web Push/);
    expect(() => parseEnv({ ...validEnv, VAPID_SUBJECT: "contato" })).toThrow(/VAPID_SUBJECT/);
  });

  it("valida as chaves de criptografia do 2FA, vault e conteúdo", () => {
    expect(() => parseEnv({ ...validEnv, VAULT_ENCRYPTION_KEY: "curta" })).toThrow(
      /VAULT_ENCRYPTION_KEY/,
    );
    expect(() => parseEnv({ ...validEnv, TWO_FACTOR_ENCRYPTION_KEY: "curta" })).toThrow(
      /TWO_FACTOR_ENCRYPTION_KEY/,
    );
    expect(() => parseEnv({ ...validEnv, CONTENT_ENCRYPTION_KEY: "curta" })).toThrow(
      /CONTENT_ENCRYPTION_KEY/,
    );
  });

  it("reúne todos os campos inválidos numa única mensagem", () => {
    const { DATABASE_URL: _, ...withoutDatabase } = validEnv;
    expect(() => parseEnv({ ...withoutDatabase, APP_ORIGIN: "não é url" })).toThrow(
      /DATABASE_URL[\s\S]*APP_ORIGIN|APP_ORIGIN[\s\S]*DATABASE_URL/,
    );
  });
});
