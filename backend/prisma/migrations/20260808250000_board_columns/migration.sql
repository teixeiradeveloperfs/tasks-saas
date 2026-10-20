CREATE TABLE "BoardColumn" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "TaskStatus" NOT NULL,
  "color" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BoardColumn_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BoardColumn" ("id", "projectId", "name", "status", "color", "position")
SELECT 'column-todo-' || "id", "id", 'A fazer', 'todo', '#94a3b8', 0 FROM "Project";
INSERT INTO "BoardColumn" ("id", "projectId", "name", "status", "color", "position")
SELECT 'column-progress-' || "id", "id", 'Em progresso', 'in_progress', '#0086f2', 1 FROM "Project";
INSERT INTO "BoardColumn" ("id", "projectId", "name", "status", "color", "position")
SELECT 'column-done-' || "id", "id", 'Concluído', 'done', '#22c55e', 2 FROM "Project";

ALTER TABLE "Task" ADD COLUMN "boardColumnId" TEXT;
UPDATE "Task" SET "boardColumnId" = CASE
  WHEN "status" = 'todo' THEN 'column-todo-' || "projectId"
  WHEN "status" = 'in_progress' THEN 'column-progress-' || "projectId"
  ELSE 'column-done-' || "projectId"
END;

CREATE UNIQUE INDEX "BoardColumn_projectId_name_key" ON "BoardColumn"("projectId", "name");
CREATE INDEX "BoardColumn_projectId_position_idx" ON "BoardColumn"("projectId", "position");
CREATE INDEX "Task_boardColumnId_position_idx" ON "Task"("boardColumnId", "position");

ALTER TABLE "BoardColumn" ADD CONSTRAINT "BoardColumn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_boardColumnId_fkey" FOREIGN KEY ("boardColumnId") REFERENCES "BoardColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
