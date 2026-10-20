CREATE TYPE "RunbookRisk" AS ENUM ('safe', 'caution', 'dangerous');

CREATE TABLE "Runbook" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "tags" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Runbook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RunbookStep" (
  "id" TEXT NOT NULL,
  "runbookId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "command" TEXT NOT NULL,
  "explanation" TEXT,
  "expectedResult" TEXT,
  "risk" "RunbookRisk" NOT NULL DEFAULT 'safe',
  "position" INTEGER NOT NULL,
  "checked" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "RunbookStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RunbookVariable" (
  "id" TEXT NOT NULL,
  "runbookId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "defaultValue" TEXT,
  "description" TEXT,
  "position" INTEGER NOT NULL,
  CONSTRAINT "RunbookVariable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RunbookFavorite" (
  "userId" TEXT NOT NULL,
  "runbookId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RunbookFavorite_pkey" PRIMARY KEY ("userId", "runbookId")
);

CREATE INDEX "Runbook_workspaceId_updatedAt_idx" ON "Runbook"("workspaceId", "updatedAt");
CREATE INDEX "Runbook_projectId_updatedAt_idx" ON "Runbook"("projectId", "updatedAt");
CREATE INDEX "RunbookStep_runbookId_position_idx" ON "RunbookStep"("runbookId", "position");
CREATE UNIQUE INDEX "RunbookVariable_runbookId_key_key" ON "RunbookVariable"("runbookId", "key");
CREATE INDEX "RunbookVariable_runbookId_position_idx" ON "RunbookVariable"("runbookId", "position");
CREATE INDEX "RunbookFavorite_runbookId_idx" ON "RunbookFavorite"("runbookId");

ALTER TABLE "Runbook" ADD CONSTRAINT "Runbook_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Runbook" ADD CONSTRAINT "Runbook_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunbookStep" ADD CONSTRAINT "RunbookStep_runbookId_fkey" FOREIGN KEY ("runbookId") REFERENCES "Runbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunbookVariable" ADD CONSTRAINT "RunbookVariable_runbookId_fkey" FOREIGN KEY ("runbookId") REFERENCES "Runbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunbookFavorite" ADD CONSTRAINT "RunbookFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunbookFavorite" ADD CONSTRAINT "RunbookFavorite_runbookId_fkey" FOREIGN KEY ("runbookId") REFERENCES "Runbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
