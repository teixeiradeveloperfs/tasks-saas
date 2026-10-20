const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  // O editor de quadros (Excalidraw) usa workers de blob para exportar imagens e
  // subconjuntos de fonte. Sem a diretiva, workers herdam default-src e quebram
  // só em produção — o meta do index.html já os liberava em desenvolvimento.
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
].join("; ");

const DISABLED_PERMISSIONS = ["camera=()", "microphone=()", "geolocation=()", "payment=()"].join(
  ", ",
);

const BODYLESS_STATUSES = new Set([204, 205, 304]);

/** Returns a copy with security headers, preserving the original response metadata/body. */
export function withSecurityHeaders(response: Response, isProduction: boolean): Response {
  const headers = new Headers(response.headers);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", DISABLED_PERMISSIONS);
  headers.set(
    isProduction ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    CONTENT_SECURITY_POLICY,
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");

  if (isProduction) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return new Response(BODYLESS_STATUSES.has(response.status) ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
