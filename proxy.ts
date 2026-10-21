import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
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
