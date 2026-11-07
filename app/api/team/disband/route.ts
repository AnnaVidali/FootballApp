import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

const BUCKETS = ["team-logos", "gallery"] as const;
const LIST_PAGE = 100;
const REMOVE_CHUNK = 100;

type StorageClient = ReturnType<typeof createClient>["storage"];

/**
 * Every team file is stored under `<teamId>/...` in both buckets, so a
 * flat listing of that prefix is enough. A page shorter than the limit
 * means there is nothing left.
 */
async function listTeamFiles(
    storage: StorageClient,
    bucket: string,
    teamId: string,
): Promise<string[]> {
    const paths: string[] = [];
    for (let offset = 0; ; offset += LIST_PAGE) {
        const { data, error } = await storage.from(bucket).list(teamId, {
            limit: LIST_PAGE,
            offset,
        });
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        for (const file of data) {
            if (file.name) paths.push(`${teamId}/${file.name}`);
        }
        if (data.length < LIST_PAGE) break;
    }
    return paths;
}

async function removeFiles(
    storage: StorageClient,
    bucket: string,
    paths: string[],
): Promise<string[]> {
    const errors: string[] = [];
    for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
        const { error } = await storage
            .from(bucket)
            .remove(paths.slice(i, i + REMOVE_CHUNK));
        if (error) errors.push(error.message);
    }
    return errors;
}

/**
 * Disband the caller's team and remove its Storage files.
 *
 * `disband_team()` deletes the database rows, but SQL cannot remove
 * Storage objects reliably (`storage.protect_delete()` blocks direct
 * deletes). The service-role client is only used after the authenticated
 * caller has been checked as the team owner, and it only touches the
 * two buckets under that team's own folder.
 */
export async function POST() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
    }

    const supabase = await createServerSupabaseClient();
    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile } = await admin
        .from("profiles")
        .select("team_id")
        .eq("user_id", user.id)
        .single();

    if (!profile?.team_id) {
        return NextResponse.json({ error: "You are not on a team." }, { status: 400 });
    }

    const teamId = profile.team_id;
    const { data: team } = await admin
        .from("teams")
        .select("owner_id")
        .eq("id", teamId)
        .single();

    if (!team || team.owner_id !== user.id) {
        return NextResponse.json(
            { error: "Only the team owner can disband the team." },
            { status: 403 },
        );
    }

    // Collect the paths before the team row (and its folder id) is gone.
    let files: Record<string, string[]>;
    try {
        files = Object.fromEntries(
            await Promise.all(
                BUCKETS.map(async (bucket) => [
                    bucket,
                    await listTeamFiles(admin.storage, bucket, teamId),
                ]),
            ),
        ) as Record<string, string[]>;
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Could not list the team's files." },
            { status: 500 },
        );
    }

    // Use the user's own session so disband_team() sees auth.uid().
    const { error: disbandError } = await supabase.rpc("disband_team");
    if (disbandError) {
        return NextResponse.json({ error: disbandError.message }, { status: 400 });
    }

    const warnings: string[] = [];
    for (const bucket of BUCKETS) {
        const errors = await removeFiles(admin.storage, bucket, files[bucket] ?? []);
        if (errors.length > 0) warnings.push(`${bucket}: ${errors.join("; ")}`);
    }

    if (warnings.length > 0) {
        console.error("disband: storage cleanup failed", warnings);
        return NextResponse.json({ success: true, warning: warnings.join(" | ") });
    }

    return NextResponse.json({ success: true });
}
