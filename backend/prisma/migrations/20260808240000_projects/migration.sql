CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Project" ("id", "workspaceId", "name", "description", "color", "createdAt")
SELECT 'default-' || "id", "id", 'Projeto padrão', 'Projeto criado automaticamente para organizar os dados existentes.', "color", CURRENT_TIMESTAMP
FROM "Workspace";

ALTER TABLE "Task" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Sprint" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Doc" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Goal" ADD COLUMN "projectId" TEXT;

UPDATE "Task" SET "projectId" = 'default-' || "workspaceId";
UPDATE "Sprint" SET "projectId" = 'default-' || "workspaceId";
UPDATE "Doc" SET "projectId" = 'default-' || "workspaceId";
UPDATE "Goal" SET "projectId" = 'default-' || "workspaceId";

ALTER TABLE "Task" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "Sprint" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "Doc" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "Goal" ALTER COLUMN "projectId" SET NOT NULL;

CREATE UNIQUE INDEX "Project_workspaceId_name_key" ON "Project"("workspaceId", "name");
CREATE INDEX "Project_workspaceId_createdAt_idx" ON "Project"("workspaceId", "createdAt");
CREATE INDEX "Task_projectId_status_position_idx" ON "Task"("projectId", "status", "position");
CREATE INDEX "Sprint_projectId_idx" ON "Sprint"("projectId");
CREATE INDEX "Doc_projectId_idx" ON "Doc"("projectId");
CREATE INDEX "Goal_projectId_idx" ON "Goal"("projectId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Doc" ADD CONSTRAINT "Doc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
