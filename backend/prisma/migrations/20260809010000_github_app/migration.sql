CREATE TABLE "GitHubConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountAvatar" TEXT,
    "connectedById" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GitHubConnection_workspaceId_key" ON "GitHubConnection"("workspaceId");
CREATE INDEX "GitHubConnection_installationId_idx" ON "GitHubConnection"("installationId");
CREATE INDEX "GitHubConnection_connectedById_idx" ON "GitHubConnection"("connectedById");

ALTER TABLE "GitHubConnection" ADD CONSTRAINT "GitHubConnection_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GitHubConnection" ADD CONSTRAINT "GitHubConnection_connectedById_fkey"
FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
