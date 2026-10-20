/**
 * O config do Lovable força o preset "cloudflare-module" quando o build sai do sandbox
 * dele (dist/index.js:579-582), descartando o preset declarado em vite.config.ts. Um
 * artefato assim sobe e só quebra na primeira senha verificada ou no primeiro pico de
 * tráfego. Esta verificação transforma isso numa falha imediata e nomeada.
 */
export function isNodeRuntime(releaseName: string | undefined): boolean {
  return releaseName === "node";
}

// O parâmetro é obrigatório de propósito. Um default (`= process.release?.name`) não
// serviria: em JavaScript o default também dispara quando o chamador passa `undefined`
// explicitamente, então o caso que mais importa testar — runtime sem `process.release` —
// leria o processo real e nunca lançaria. Quem chama passa `process.release?.name`.
export function assertNodeRuntime(releaseName: string | undefined): void {
  if (isNodeRuntime(releaseName)) return;

  throw new Error(
    "Este artefato não está rodando em Node. O projeto exige o preset " +
      'nitro: { preset: "node-server" } em vite.config.ts — argon2 e o rate-limit ' +
      "em memória não funcionam fora do Node. Se o build saiu do sandbox do Lovable, " +
      "o preset foi sobrescrito para cloudflare-module: publique pelo pipeline próprio.",
  );
}
