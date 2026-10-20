import { cpSync, existsSync, realpathSync, readFileSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:4000";

const FONT_TYPES: Record<string, string> = {
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

/**
 * Serve e empacota as fontes do Excalidraw a partir da própria origem.
 *
 * O editor busca as fontes em tempo de execução via EXCALIDRAW_ASSET_PATH (ver
 * whiteboard-editor.tsx); sem isto ele cai no CDN, que a CSP (`font-src 'self'`)
 * bloqueia. Cópia direta com fs.cp, e não plugin de glob: o caminho real do pacote
 * atravessa o diretório do bun (`@excalidraw+excalidraw@…`), cujos caracteres os
 * resolvedores de glob tratam como sintaxe e devolvem vazio.
 */
function excalidrawFonts(): Plugin {
  // realpath porque node_modules/@excalidraw é symlink do workspace.
  const source = realpathSync(
    resolve(__dirname, "node_modules/@excalidraw/excalidraw/dist/prod/fonts"),
  );
  let outDir = "dist";

  return {
    name: "excalidraw-fonts",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      cpSync(source, resolve(__dirname, outDir, "excalidraw-assets/fonts"), { recursive: true });
    },
    configureServer(server) {
      server.middlewares.use("/excalidraw-assets/fonts", (req, res, next) => {
        const relative = normalize(decodeURIComponent(req.url ?? "/")).replace(/^([/\\])+/, "");
        const file = join(source, relative);
        // `normalize` acima colapsa `..`; o prefixo garante que nada escape da pasta.
        if (!file.startsWith(source) || !existsSync(file)) return next();
        const type = FONT_TYPES[file.slice(file.lastIndexOf("."))];
        if (!type) return next();
        res.setHeader("Content-Type", type);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    excalidrawFonts(),
  ],
  server: {
    port: 5173,
    // A API responde por baixo da mesma origem do frontend. É o que mantém o cookie
    // de sessão em sameSite=lax: num acesso entre origens o navegador não o enviaria,
    // e afrouxá-lo para sameSite=none custaria a proteção que ele dá contra CSRF.
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
    },
  },
});
