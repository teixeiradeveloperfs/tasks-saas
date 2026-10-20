import "dotenv/config";

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL não definida. Copie .env.example para .env e preencha as duas URLs.",
  );
}

if (testUrl === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL é igual a DATABASE_URL. Os testes truncam as tabelas — " +
      "apontar para o banco de desenvolvimento apagaria seus dados.",
  );
}

// O cliente lê DATABASE_URL; nos testes ela passa a ser a do banco de teste.
process.env.DATABASE_URL = testUrl;

// Importado dinamicamente de propósito: `import` estático é içado para o topo do
// módulo e executaria antes da linha acima, construindo o cliente apontado para o
// banco de desenvolvimento — que os testes então truncariam.
const { prisma } = await import("@/db/client");

/**
 * Esvazia todas as tabelas do schema public, menos o controle de migrations.
 * Descobre as tabelas pelo catálogo em vez de listá-las à mão, para não sair do ar
 * quando o schema crescer.
 */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
