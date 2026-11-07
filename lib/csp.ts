/**
 * The app's Content-Security-Policy.
 *
 * Kept in one place so the proxy can build it per request and the unit
 * tests can pin its contents. The nonce is generated per request by the
 * proxy; Next.js reads it back out of the request's CSP header and puts
 * it on the framework's own inline scripts.
 *
 * Supabase is the only cross-origin dependency: the browser talks to it
 * for auth/PostgREST (`connect-src`) and displays team logos from its
 * Storage (`img-src`). The origin is derived from the environment, so a
 * different project does not need a code change.
 *
 * `style-src` keeps `'unsafe-inline'`: the app sets colours through React
 * `style` props, which are inline style attributes, and Tailwind emits
 * inline styles too. Scripts do not rely on it.
 */
export function buildCsp({
  nonce,
  isDev,
  supabaseUrl,
}: {
  nonce: string;
  isDev: boolean;
  supabaseUrl: string;
}): string {
  const supabaseOrigin = toOrigin(supabaseUrl);
  const supabaseWs = supabaseOrigin?.replace(/^http/, "ws");

  const directives = [
    "default-src 'self'",
    // Next.js attaches this nonce to its own inline scripts. In
    // development React needs eval for its enhanced error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    "font-src 'self'",
    `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseWs}` : ""}${isDev ? " ws: wss:" : ""}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  // On plain-http localhost this would rewrite the dev server's own
  // requests to https, so it only ships in production.
  if (!isDev) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}

function toOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
