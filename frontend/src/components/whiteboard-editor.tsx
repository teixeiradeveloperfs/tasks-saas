import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";

// As fontes (e demais assets carregados em tempo de execução) vêm da própria
// origem — copiadas no build pelo vite-plugin-static-copy. Sem isto o Excalidraw
// cai no CDN, que a CSP (`font-src 'self'`) bloqueia.
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}
window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

const SAVE_DEBOUNCE_MS = 1500;

function parseScene(scene: string): ExcalidrawInitialDataState | null {
  if (!scene.trim()) return null;
  try {
    const parsed = JSON.parse(scene) as ExcalidrawInitialDataState;
    // `collaborators` serializado como objeto quebra a restauração do Excalidraw,
    // que espera um Map; nunca persistimos, mas cenas antigas podem carregar.
    if (parsed.appState && "collaborators" in parsed.appState) {
      delete (parsed.appState as Record<string, unknown>).collaborators;
    }
    return parsed;
  } catch {
    return null;
  }
}

type Props = {
  /** Cena serializada como veio do servidor; string vazia para quadro novo. */
  initialScene: string;
  /** Chamado com a cena serializada a cada pausa no desenho. */
  onPersist: (scene: string) => void;
  readOnly?: boolean;
};

/**
 * Excalidraw embutido com salvamento automático.
 *
 * O componente é intencionalmente não-controlado: o Excalidraw é dono do estado
 * do desenho, e nós só observamos as mudanças para persistir. Reidratar a cena a
 * cada resposta do servidor faria o traço "pular" no meio do desenho.
 */
export function WhiteboardEditor({ initialScene, onPersist, readOnly = false }: Props) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSavedRef = useRef(initialScene);
  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;

  const initialData = useMemo(() => parseScene(initialScene), [initialScene]);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const api = apiRef.current;
    if (!api) return;
    const scene = serializeAsJSON(
      api.getSceneElements(),
      api.getAppState(),
      api.getFiles(),
      "local",
    );
    if (scene === lastSavedRef.current) return;
    lastSavedRef.current = scene;
    onPersistRef.current(scene);
  }, []);

  const scheduleSave = useCallback(() => {
    if (readOnly) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush, readOnly]);

  // Sair da página não pode engolir o traço que ainda não salvou.
  useEffect(() => {
    if (readOnly) return;
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [flush, readOnly]);

  return (
    <Excalidraw
      excalidrawAPI={(api) => {
        apiRef.current = api;
      }}
      initialData={initialData ?? undefined}
      onChange={scheduleSave}
      viewModeEnabled={readOnly}
      langCode="pt-BR"
    />
  );
}
