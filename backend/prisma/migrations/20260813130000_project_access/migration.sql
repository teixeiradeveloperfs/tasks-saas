-- Acesso por projeto: um membro do workspace passa a enxergar apenas os projetos
-- em que tem concessão. OWNER e ADMIN seguem enxergando tudo, por regra na
-- aplicação, sem depender destas linhas.

CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Projetos que o convite libera.
ALTER TABLE "WorkspaceInvite" ADD COLUMN "projectIds" TEXT[];

-- Preserva o acesso de quem já é membro: antes desta migration todo membro
-- enxergava todo projeto do workspace, e ninguém pode perder acesso na subida.
-- Inclui OWNER e ADMIN de propósito, para que um rebaixamento futuro para MEMBER
-- não apague de uma vez tudo o que a pessoa via.
INSERT INTO "ProjectMember" ("id", "projectId", "userId")
SELECT gen_random_uuid()::text, p."id", m."userId"
FROM "Project" p
JOIN "WorkspaceMember" m ON m."workspaceId" = p."workspaceId"
ON CONFLICT DO NOTHING;
