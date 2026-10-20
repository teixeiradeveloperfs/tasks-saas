-- Quadros de desenho livre (Excalidraw embutido), um por projeto como os documentos.
-- `scene` guarda o envelope criptografado `automa:enc:v1:`, nunca JSON aberto.

CREATE TABLE "Whiteboard" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scene" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Whiteboard_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Whiteboard_workspaceId_idx" ON "Whiteboard"("workspaceId");
CREATE INDEX "Whiteboard_projectId_idx" ON "Whiteboard"("projectId");

ALTER TABLE "Whiteboard" ADD CONSTRAINT "Whiteboard_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Whiteboard" ADD CONSTRAINT "Whiteboard_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
