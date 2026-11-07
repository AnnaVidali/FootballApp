import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp } from "@/lib/csp";

export async function proxy(request: NextRequest) {
  // A fresh, unpredictable nonce per request. Next.js extracts it from
  // the request's CSP header and applies it to its own inline scripts;
  // our one hand-written inline script reads it from the layout.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  });

  // `updateSession` passes this request to NextResponse.next(), so the
  // headers set here are visible to the rendered page (x-nonce for the
  // layout) and to Next's nonce extraction (Content-Security-Policy).
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // `api` is excluded on purpose: the route handlers under /api do their
    // own auth check and must be able to answer with a real status code.
    // Intercepting them turned every 401 into a 307 to /login, which
    // fetch() then followed, so the client saw "200 OK" with an HTML body.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
