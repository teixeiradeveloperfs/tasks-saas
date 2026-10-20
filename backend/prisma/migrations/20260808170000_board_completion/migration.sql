CREATE TYPE "WorkspacePermission" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

ALTER TABLE "WorkspaceMember"
  ADD COLUMN "permission" "WorkspacePermission" NOT NULL DEFAULT 'MEMBER';

UPDATE "WorkspaceMember"
SET "permission" = 'OWNER'
WHERE LOWER(COALESCE("title", '')) = 'owner';

ALTER TABLE "WorkspaceInvite"
  ADD COLUMN "permission" "WorkspacePermission" NOT NULL DEFAULT 'MEMBER';

ALTER TABLE "Task" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "workspaceId", "status"
    ORDER BY "createdAt", "id"
  ) - 1 AS next_position
  FROM "Task"
)
UPDATE "Task"
SET "position" = ranked.next_position
FROM ranked
WHERE "Task"."id" = ranked."id";

DROP INDEX IF EXISTS "Task_workspaceId_idx";
CREATE INDEX "Task_workspaceId_status_position_idx"
  ON "Task"("workspaceId", "status", "position");

CREATE TABLE "Attachment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Attachment_taskId_createdAt_idx" ON "Attachment"("taskId", "createdAt");
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey"
  FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "summary" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId", "createdAt");
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
