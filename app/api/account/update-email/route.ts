import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

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

    // Use @supabase/ssr to read the session from cookies properly
    const cookieHeader = request.headers.get("cookie") || "";
    const origin = new URL(request.url).origin;

    const res = new Response(null, { headers: { "set-cookie": "" } });
    const supabase = createServerClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
            getAll() {
                return cookieHeader.split(";").map((c) => {
                    const [name, ...rest] = c.trim().split("=");
                    return { name, value: rest.join("=") };
                });
            },
            setAll() {},
        },
    });

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
