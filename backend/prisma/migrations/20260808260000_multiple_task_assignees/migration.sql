CREATE TABLE "TaskAssignment" (
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("taskId", "userId")
);

INSERT INTO "TaskAssignment" ("taskId", "userId", "createdAt")
SELECT "id", "assigneeId", CURRENT_TIMESTAMP
FROM "Task"
WHERE "assigneeId" IS NOT NULL;

CREATE INDEX "TaskAssignment_userId_idx" ON "TaskAssignment"("userId");
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
