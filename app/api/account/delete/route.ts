import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { readJsonBody, rejectCrossOrigin, verifyPassword } from "@/lib/api-guard";

export async function POST(request: Request) {
    const blocked = rejectCrossOrigin(request);
    if (blocked) return blocked;

    const body = await readJsonBody(request);
    const currentPassword =
        typeof body?.currentPassword === "string" ? body.currentPassword : "";

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
        return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
    }

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

    if (!currentPassword) {
        return NextResponse.json(
            { error: "Current password is required.", code: "password_required" },
            { status: 400 },
        );
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

    const passwordOk = await verifyPassword(user.email, currentPassword);
    if (!passwordOk) {
        return NextResponse.json(
            { error: "Current password is incorrect.", code: "invalid_password" },
            { status: 401 },
        );
    }

    // Delete the auth user
    const { error } = await adminClient.auth.admin.deleteUser(user.id);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
}
