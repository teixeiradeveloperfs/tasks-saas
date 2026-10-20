-- Sessões anteriores ao armazenamento por hash não podem ser migradas com segurança.
-- Invalidá-las evita falha no NOT NULL e exige um novo login dos usuários afetados.
DELETE FROM "Session" WHERE "tokenHash" IS NULL;

ALTER TABLE "Session" ALTER COLUMN "tokenHash" SET NOT NULL;
