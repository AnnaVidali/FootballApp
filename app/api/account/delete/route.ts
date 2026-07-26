import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
        return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
    }

    const cookieHeader = request.headers.get("cookie") || "";
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // Block team owner from deleting account — must transfer ownership first
    const { data: profile } = await adminClient
        .from("profiles")
        .select("team_id")
        .eq("user_id", user.id)
        .single();

    if (profile?.team_id) {
        const { data: team } = await adminClient
            .from("teams")
            .select("owner_id")
            .eq("id", profile.team_id)
            .single();

        if (team?.owner_id === user.id) {
            return NextResponse.json(
                { error: "You're the team owner. Transfer ownership to another member before deleting your account." },
                { status: 400 },
            );
        }
    }

    // Delete the auth user
    const { error } = await adminClient.auth.admin.deleteUser(user.id);
    if (error) {
        console.error("Failed to delete auth user:", error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
}
