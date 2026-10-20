import { createSign } from "node:crypto";
import type {
  GitHubPullRequest,
  GitHubRepository,
  GitHubRepositoryActivity,
  GitHubWorkflowRun,
} from "@task-flow/shared/domain/github-contracts";

import { getEnv } from "@/config/env";

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

export class GitHubConfigurationError extends Error {
  statusCode = 503;
  statusMessage = "A integração com GitHub ainda não foi configurada pelo administrador.";
}

export class GitHubRequestError extends Error {
  statusCode = 502;
  statusMessage = "Não foi possível consultar o GitHub agora.";
}

type GitHubConfig = {
  appId: string;
  slug: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  setupUrl: string;
  oauthCallbackUrl: string;
};

export function githubConfigured(): boolean {
  const env = getEnv();
  return Boolean(
    env.GITHUB_APP_ID &&
    env.GITHUB_APP_SLUG &&
    env.GITHUB_APP_PRIVATE_KEY_BASE64 &&
    env.GITHUB_CLIENT_ID &&
    env.GITHUB_CLIENT_SECRET,
  );
}

export function githubConfig(): GitHubConfig {
  const env = getEnv();
  if (!githubConfigured()) throw new GitHubConfigurationError();
  return {
    appId: env.GITHUB_APP_ID!,
    slug: env.GITHUB_APP_SLUG!,
    privateKey: Buffer.from(env.GITHUB_APP_PRIVATE_KEY_BASE64!, "base64").toString("utf8"),
    clientId: env.GITHUB_CLIENT_ID!,
    clientSecret: env.GITHUB_CLIENT_SECRET!,
    setupUrl:
      env.GITHUB_SETUP_URL ?? new URL("/api/integrations/github/setup", env.APP_ORIGIN).toString(),
    oauthCallbackUrl:
      env.GITHUB_OAUTH_CALLBACK_URL ??
      new URL("/api/integrations/github/oauth-callback", env.APP_ORIGIN).toString(),
  };
}

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function appJwt(): string {
  const config = githubConfig();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: config.appId }),
  )}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(config.privateKey, "base64url")}`;
}

async function githubFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(`${API}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "Automa-Tasks-GitHub-App",
        ...init.headers,
      },
    });
    if (!response.ok) throw new GitHubRequestError(`GitHub respondeu ${response.status}.`);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof GitHubRequestError) throw error;
    throw new GitHubRequestError(error instanceof Error ? error.message : undefined);
  }
}

type Installation = {
  id: number;
  app_id: number;
  account: { login: string; type: string; avatar_url?: string } | null;
};

export function githubInstallationUrl(state: string): string {
  const { slug } = githubConfig();
  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function githubUserAuthorizationUrl(state: string): string {
  const config = githubConfig();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.oauthCallbackUrl);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGitHubUserCode(code: string): Promise<string> {
  const config = githubConfig();
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.oauthCallbackUrl,
    }),
  });
  const body = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !body.access_token) throw new GitHubRequestError(body.error);
  return body.access_token;
}

export async function verifyUserInstallation(
  userAccessToken: string,
  installationId: string,
): Promise<Installation> {
  for (let page = 1; page <= 10; page += 1) {
    const body = await githubFetch<{ total_count: number; installations: Installation[] }>(
      `/user/installations?per_page=100&page=${page}`,
      userAccessToken,
    );
    const installation = body.installations.find((item) => String(item.id) === installationId);
    if (installation) {
      if (String(installation.app_id) !== githubConfig().appId) throw new GitHubRequestError();
      return installation;
    }
    if (body.installations.length < 100) break;
  }
  throw new GitHubRequestError("A instalação não está acessível para este usuário.");
}

async function installationToken(installationId: string): Promise<string> {
  const body = await githubFetch<{ token: string }>(
    `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    appJwt(),
    { method: "POST" },
  );
  return body.token;
}

type RepositoryResponse = {
  repositories: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
    html_url: string;
  }>;
};

function mapRepository(repository: RepositoryResponse["repositories"][number]): GitHubRepository {
  return {
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    private: repository.private,
    defaultBranch: repository.default_branch,
    url: repository.html_url,
  };
}

export async function listGitHubRepositories(installationId: string): Promise<GitHubRepository[]> {
  const token = await installationToken(installationId);
  const all = await listRawRepositories(token);
  return all.map(mapRepository).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

async function listRawRepositories(token: string): Promise<RepositoryResponse["repositories"]> {
  const all: RepositoryResponse["repositories"] = [];
  for (let page = 1; page <= 10; page += 1) {
    const body = await githubFetch<RepositoryResponse>(
      `/installation/repositories?per_page=100&page=${page}`,
      token,
    );
    all.push(...body.repositories);
    if (body.repositories.length < 100) break;
  }
  return all;
}

type PullResponse = Array<{
  id: number;
  number: number;
  title: string;
  html_url: string;
  draft?: boolean;
  user: { login: string; avatar_url?: string } | null;
  head: { ref: string };
  base: { ref: string };
  updated_at: string;
}>;

type RunsResponse = {
  workflow_runs: Array<{
    id: number;
    name?: string;
    display_title?: string;
    html_url: string;
    event: string;
    head_branch?: string | null;
    status: string;
    conclusion?: string | null;
    run_started_at?: string;
    created_at: string;
    updated_at: string;
  }>;
};

export type GitHubPullRequestSnapshot = {
  repositoryFullName: string;
  number: number;
  title: string;
  url: string;
  state: string;
  draft: boolean;
  merged: boolean;
  headSha: string;
  ciStatus: string;
  ciConclusion?: string;
};

function workflowSummary(runs: RunsResponse["workflow_runs"]): {
  status: string;
  conclusion?: string;
} {
  if (runs.length === 0) return { status: "unknown" };
  if (runs.some((run) => run.status !== "completed")) return { status: "pending" };
  const conclusions = runs.map((run) => run.conclusion).filter(Boolean) as string[];
  const failed = conclusions.find((value) =>
    ["failure", "timed_out", "action_required", "startup_failure", "stale"].includes(value),
  );
  if (failed) return { status: "failure", conclusion: failed };
  if (conclusions.includes("cancelled")) return { status: "cancelled", conclusion: "cancelled" };
  return { status: "success", conclusion: conclusions[0] ?? "success" };
}

export async function readGitHubPullRequest(
  installationId: string,
  repositoryFullName: string,
  number: number,
): Promise<GitHubPullRequestSnapshot> {
  const token = await installationToken(installationId);
  const repositories = await listRawRepositories(token);
  if (!repositories.some((repository) => repository.full_name === repositoryFullName)) {
    const error = new Error("Repositório não autorizado nesta instalação.") as Error & {
      statusCode: number;
    };
    error.statusCode = 404;
    throw error;
  }
  const encodedName = repositoryFullName.split("/").map(encodeURIComponent).join("/");
  const pull = await githubFetch<{
    number: number;
    title: string;
    html_url: string;
    state: string;
    draft?: boolean;
    merged: boolean;
    head: { sha: string };
  }>(`/repos/${encodedName}/pulls/${number}`, token);
  const runs = await githubFetch<RunsResponse>(
    `/repos/${encodedName}/actions/runs?head_sha=${encodeURIComponent(pull.head.sha)}&per_page=50`,
    token,
  );
  const ci = workflowSummary(runs.workflow_runs);
  return {
    repositoryFullName,
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
    state: pull.state,
    draft: Boolean(pull.draft),
    merged: pull.merged,
    headSha: pull.head.sha,
    ciStatus: ci.status,
    ciConclusion: ci.conclusion,
  };
}

export async function githubRepositoryActivity(
  installationId: string,
  fullName: string,
): Promise<GitHubRepositoryActivity> {
  const token = await installationToken(installationId);
  const repositories = await listRawRepositories(token);
  const rawRepository = repositories.find((item) => item.full_name === fullName);
  if (!rawRepository) {
    const error = new Error("Repositório não pertence a esta instalação.") as Error & {
      statusCode: number;
    };
    error.statusCode = 404;
    throw error;
  }
  const encodedName = fullName.split("/").map(encodeURIComponent).join("/");
  const [pulls, runs] = await Promise.all([
    githubFetch<PullResponse>(`/repos/${encodedName}/pulls?state=open&per_page=50`, token),
    githubFetch<RunsResponse>(`/repos/${encodedName}/actions/runs?per_page=30`, token),
  ]);
  const pullRequests: GitHubPullRequest[] = pulls.map((pull) => ({
    id: pull.id,
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
    draft: Boolean(pull.draft),
    author: pull.user?.login ?? "GitHub",
    authorAvatar: pull.user?.avatar_url,
    headBranch: pull.head.ref,
    baseBranch: pull.base.ref,
    updatedAt: pull.updated_at,
  }));
  const workflowRuns: GitHubWorkflowRun[] = runs.workflow_runs.map((run) => ({
    id: run.id,
    name: run.name ?? "Workflow",
    title: run.display_title ?? run.name ?? "Execução",
    url: run.html_url,
    event: run.event,
    branch: run.head_branch ?? undefined,
    status: run.status,
    conclusion: run.conclusion ?? undefined,
    startedAt: run.run_started_at ?? run.created_at,
    updatedAt: run.updated_at,
  }));
  return { repository: mapRepository(rawRepository), pullRequests, workflowRuns };
}
