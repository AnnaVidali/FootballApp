import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Second line of defence for the state-changing /api routes.
 *
 * Supabase's session cookies are SameSite=Lax, so a cross-site form POST
 * cannot carry them in the first place. Browsers still send `Origin` on
 * every POST, so rejecting a mismatched origin catches the cases that
 * SameSite does not cover (older browsers, a future cookie change).
 *
 * Requests without an `Origin` header (curl, server-to-server, the E2E
 * script) are allowed through; they still need a valid session cookie.
 */
export function rejectCrossOrigin(request: Request): NextResponse | null {
    const origin = request.headers.get("origin");
    if (!origin) return null;

    let requestOrigin: string;
    try {
        requestOrigin = new URL(origin).origin;
    } catch {
        return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    }

    if (requestOrigin !== new URL(request.url).origin) {
        return NextResponse.json(
            { error: "Cross-origin request rejected." },
            { status: 403 },
        );
    }

    return null;
}

/**
 * Re-authenticate the signed-in user before a sensitive change.
 *
 * The server-side session cookie proves *a* session, not that the person
 * at the keyboard knows the password. Verifying it with a throwaway
 * client means a stolen cookie cannot change the email or delete the
 * account on its own. Supabase's own auth rate limits apply.
 */
export async function verifyPassword(
    email: string,
    password: string,
): Promise<boolean> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return false;

    const client = createClient(url, anonKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
    });

    const { error } = await client.auth.signInWithPassword({ email, password });
    return !error;
}

/** Read a JSON body without throwing on malformed input. */
export async function readJsonBody(
    request: Request,
): Promise<Record<string, unknown> | null> {
    try {
        const body = await request.json();
        return body && typeof body === "object" ? body : null;
    } catch {
        return null;
    }
}
