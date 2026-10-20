/** Resolves the last hop written by the configured trusted proxy. */
export function resolveClientIp(
  headers: Headers,
  trustedHeader: string | undefined,
): string | null {
  if (!trustedHeader) return null;

  const value = headers.get(trustedHeader);
  if (!value) return null;

  const hops = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return hops.at(-1) ?? null;
}
