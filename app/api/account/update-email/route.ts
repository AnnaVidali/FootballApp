import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
    const { newEmail } = await request.json();

    if (!newEmail || typeof newEmail !== "string" || !newEmail.includes("@")) {
        return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
        return NextResponse.json(
            { error: "Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY." },
            { status: 500 }
        );
    }

    // Read the session from cookies via the shared server client, which
    // uses @supabase/ssr's own cookie handling.
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Use the service role key to update the email directly (bypasses SMTP)
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
