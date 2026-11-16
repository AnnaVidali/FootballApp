import type { Metadata } from "next";
import LineupPageClient from "@/components/LineupPageClient";
import { getSessionContext } from "@/lib/session";
import { pageMetadata } from "@/lib/page-metadata";

export async function generateMetadata(): Promise<Metadata> {
    return pageMetadata("nav.lineup");
}

export default async function LineupPage() {
    const { supabase, user, profile } = await getSessionContext();

    if (!user || !profile?.team_id) {
        return (
            <LineupPageClient initialEvents={[]} initialMembers={[]} isAdmin={false} />
        );
    }

    // Matches that kicked off less than 90 minutes ago are still editable,
    // matching the window the previous client-side load used.
    const cutoffDate = new Date();
    cutoffDate.setMinutes(cutoffDate.getMinutes() - 90);
    const cutoff = cutoffDate.toISOString();

    // The members and the matches do not depend on each other, so load them
    // together instead of one after the other.
    const [{ data: members }, { data: matches }] = await Promise.all([
        supabase
            .from("profiles")
            .select("id, user_id, name, position, shirt_number, role")
            .eq("team_id", profile.team_id)
            .order("name"),
        supabase
            .from("events")
            .select("id, title, type, date, location, formation, captain_id")
            .eq("team_id", profile.team_id)
            .eq("type", "match")
            .gte("date", cutoff)
            .order("date", { ascending: true }),
    ]);

    return (
        <LineupPageClient
            initialEvents={matches ?? []}
            initialMembers={members ?? []}
            isAdmin={profile.is_admin}
        />
    );
}
