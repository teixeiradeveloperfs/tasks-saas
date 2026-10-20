import { useEffect, useState } from "react";

/**
 * Returns false on the server / first client render, true after mount.
 * Use to gate rendering of date-dependent or persisted-store-dependent UI
 * that would otherwise cause a hydration mismatch.
 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
