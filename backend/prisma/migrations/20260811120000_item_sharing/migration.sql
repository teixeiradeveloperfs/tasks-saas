CREATE TABLE "RunbookShare" (
    "id" TEXT NOT NULL,
    "runbookId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "sharedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RunbookShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VaultEntryShare" (
    "id" TEXT NOT NULL,
    "vaultEntryId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "sharedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VaultEntryShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RunbookShare_runbookId_sharedWithId_key" ON "RunbookShare"("runbookId", "sharedWithId");
CREATE INDEX "RunbookShare_sharedWithId_createdAt_idx" ON "RunbookShare"("sharedWithId", "createdAt");
CREATE INDEX "RunbookShare_sharedById_idx" ON "RunbookShare"("sharedById");
CREATE UNIQUE INDEX "VaultEntryShare_vaultEntryId_sharedWithId_key" ON "VaultEntryShare"("vaultEntryId", "sharedWithId");
CREATE INDEX "VaultEntryShare_sharedWithId_createdAt_idx" ON "VaultEntryShare"("sharedWithId", "createdAt");
CREATE INDEX "VaultEntryShare_sharedById_idx" ON "VaultEntryShare"("sharedById");

ALTER TABLE "RunbookShare" ADD CONSTRAINT "RunbookShare_runbookId_fkey" FOREIGN KEY ("runbookId") REFERENCES "Runbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunbookShare" ADD CONSTRAINT "RunbookShare_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunbookShare" ADD CONSTRAINT "RunbookShare_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VaultEntryShare" ADD CONSTRAINT "VaultEntryShare_vaultEntryId_fkey" FOREIGN KEY ("vaultEntryId") REFERENCES "VaultEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultEntryShare" ADD CONSTRAINT "VaultEntryShare_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultEntryShare" ADD CONSTRAINT "VaultEntryShare_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
