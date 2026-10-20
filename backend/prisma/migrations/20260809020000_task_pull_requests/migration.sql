CREATE TABLE "GitHubPullRequestLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "repositoryFullName" TEXT NOT NULL,
    "pullRequestNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "merged" BOOLEAN NOT NULL DEFAULT false,
    "headSha" TEXT,
    "ciStatus" TEXT NOT NULL DEFAULT 'unknown',
    "ciConclusion" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubPullRequestLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GitHubPullRequestLink_taskId_repositoryFullName_pullRequestNumber_key"
ON "GitHubPullRequestLink"("taskId", "repositoryFullName", "pullRequestNumber");
CREATE INDEX "GitHubPullRequestLink_repositoryFullName_pullRequestNumber_idx"
ON "GitHubPullRequestLink"("repositoryFullName", "pullRequestNumber");
CREATE INDEX "GitHubPullRequestLink_repositoryFullName_headSha_idx"
ON "GitHubPullRequestLink"("repositoryFullName", "headSha");

ALTER TABLE "GitHubPullRequestLink" ADD CONSTRAINT "GitHubPullRequestLink_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
