import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "prisma/**/*.test.ts"],
    setupFiles: ["src/db/testing.ts"],
    // Os testes compartilham um único banco; rodar em paralelo faria um caso
    // truncar as tabelas enquanto outro ainda lê.
    fileParallelism: false,
  },
});
