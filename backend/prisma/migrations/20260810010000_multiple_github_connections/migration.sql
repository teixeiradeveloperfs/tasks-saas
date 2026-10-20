DROP INDEX "GitHubConnection_workspaceId_key";

CREATE UNIQUE INDEX "GitHubConnection_workspaceId_installationId_key"
ON "GitHubConnection"("workspaceId", "installationId");

CREATE INDEX "GitHubConnection_workspaceId_idx" ON "GitHubConnection"("workspaceId");
