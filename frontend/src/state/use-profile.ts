import { useStore } from "@/lib/store";
import type { Profile } from "@task-flow/shared/domain/models";

/**
 * Lê o perfil dentro da área autenticada, onde o `loader` de `_authed` já hidratou o
 * store. Lançar em vez de devolver `null` mantém o invariante num lugar só: sem isso,
 * cinco componentes precisariam de `profile?.` e um perfil ausente viraria tela vazia
 * silenciosa em vez de erro visível.
 */
export function useProfile(): Profile {
  const profile = useStore((s) => s.profile);
  if (!profile) {
    throw new Error(
      "useProfile foi chamado fora da rota _authed, ou antes de o loader hidratar o store.",
    );
  }
  return profile;
}
