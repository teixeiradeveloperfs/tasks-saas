export type GitHubConnection = {
  id: string;
  accountLogin: string;
  accountType: string;
  accountAvatar?: string;
  connectedAt: string;
};

export type GitHubConnectionStatus = {
  configured: boolean;
  connected: boolean;
  canManage: boolean;
  connections: GitHubConnection[];
};

export type GitHubRepository = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  url: string;
  connectionId?: string;
  accountLogin?: string;
  accountType?: string;
};

export type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  url: string;
  draft: boolean;
  author: string;
  authorAvatar?: string;
  headBranch: string;
  baseBranch: string;
  updatedAt: string;
};

export type GitHubWorkflowRun = {
  id: number;
  name: string;
  title: string;
  url: string;
  event: string;
  branch?: string;
  status: string;
  conclusion?: string;
  startedAt: string;
  updatedAt: string;
};

export type GitHubRepositoryActivity = {
  repository: GitHubRepository;
  pullRequests: GitHubPullRequest[];
  workflowRuns: GitHubWorkflowRun[];
};
