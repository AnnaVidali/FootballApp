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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json(
            { error: "Server misconfigured.", code: "server_misconfigured" },
            { status: 500 },
        );
    }

    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json(
            { error: "Not authenticated.", code: "not_authenticated" },
            { status: 401 },
        );
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
        .select("team_id, is_admin")
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
                {
                    error: "You're the team owner. Transfer ownership to another member before deleting your account.",
                    code: "owner",
                },
                { status: 400 },
            );
        }

        // The roster page checks this through can_leave_team(), but that is
        // a client-side gate. Enforce it here too so a direct POST cannot
        // delete the last admin and leave a team no one can manage.
        if (profile.is_admin) {
            const { data: admins, error: countError } = await adminClient
                .from("profiles")
                .select("id")
                .eq("team_id", profile.team_id)
                .eq("is_admin", true);

            if (countError) {
                console.error("delete-account: admin count failed", countError.message);
                return NextResponse.json(
                    { error: "Could not verify the team's admins.", code: "server_misconfigured" },
                    { status: 500 },
                );
            }

            if ((admins?.length ?? 0) <= 1) {
                return NextResponse.json(
                    {
                        error: "You're the only admin on this team. Promote another player before deleting your account.",
                        code: "sole_admin",
                    },
                    { status: 400 },
                );
            }
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
        console.error("delete-account: admin delete failed", error.message);
        return NextResponse.json(
            { error: "Could not delete the account.", code: "delete_failed" },
            { status: 400 },
        );
    }

    return NextResponse.json({ success: true });
}
