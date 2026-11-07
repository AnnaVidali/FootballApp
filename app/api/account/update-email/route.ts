import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { readJsonBody, rejectCrossOrigin, verifyPassword } from "@/lib/api-guard";

export async function POST(request: Request) {
    const blocked = rejectCrossOrigin(request);
    if (blocked) return blocked;

    const body = await readJsonBody(request);
    const newEmail = typeof body?.newEmail === "string" ? body.newEmail.trim() : "";
    const currentPassword =
        typeof body?.currentPassword === "string" ? body.currentPassword : "";

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
        return NextResponse.json(
            { error: "Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY." },
            { status: 500 },
        );
    }

    // Read the session from cookies via the shared server client, which
    // uses @supabase/ssr's own cookie handling.
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    if (!user.email) {
        return NextResponse.json(
            { error: "The current account has no email address.", code: "no_email" },
            { status: 400 },
        );
    }

    if (!newEmail || !newEmail.includes("@")) {
        return NextResponse.json(
            { error: "Invalid email address.", code: "invalid_email" },
            { status: 400 },
        );
    }

    if (!currentPassword) {
        return NextResponse.json(
            { error: "Current password is required.", code: "password_required" },
            { status: 400 },
        );
    }

    if (newEmail.toLowerCase() === user.email.toLowerCase()) {
        return NextResponse.json(
            { error: "That is already your email address.", code: "email_unchanged" },
            { status: 400 },
        );
    }

    const passwordOk = await verifyPassword(user.email, currentPassword);
    if (!passwordOk) {
        return NextResponse.json(
            { error: "Current password is incorrect.", code: "invalid_password" },
            { status: 401 },
        );
    }

    // Use the service role key to update the email directly (bypasses SMTP).
    // Re-authenticating above is what makes this safe: a stolen session
    // cookie is no longer enough to take over the account.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await adminClient.auth.admin.updateUserById(user.id, {
        email: newEmail,
        email_confirm: true,
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
}
