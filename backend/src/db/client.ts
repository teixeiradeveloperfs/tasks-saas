import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/config/env";

// O hot reload do Vite reavalia este módulo a cada alteração. Guardar a instância
// no escopo global impede que as conexões se acumulem até o Postgres recusar novas.
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function createClient() {
  const connectionString = getEnv().DATABASE_URL;

  // No Prisma 7 o cliente não lê a URL do schema — a conexão vem deste adapter.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
