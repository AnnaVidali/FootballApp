import { redirect, notFound } from "next/navigation";
import LineupEditor from "@/components/LineupEditor";
import { getSessionContext } from "@/lib/session";

export default async function LineupPage({
    params,
}: {
    params: Promise<{ eventId: string }>;
}) {
    const { eventId } = await params;
    const { supabase, user, profile } = await getSessionContext();
    if (!user) redirect("/login");
    if (!profile?.team_id) redirect("/dashboard");

    const { data: event } = await supabase
        .from("events")
        .select("id, title, type, date, location, team_id, formation, captain_id")
        .eq("id", eventId)
        .single();
    if (!event || event.team_id !== profile.team_id) notFound();

    const { data: members } = await supabase
        .from("profiles")
        .select("id, user_id, name, position, shirt_number, role")
        .eq("team_id", profile.team_id)
        .order("name");

    const { data: lineup } = await supabase
        .from("lineups")
        .select("id, player_id, position, shirt_number, pos_x, pos_y")
        .eq("event_id", eventId);

    const { data: available } = await supabase
        .from("availability")
        .select("user_id")
        .eq("event_id", eventId)
        .eq("status", "available");
    const availableUserIds = new Set((available ?? []).map((a) => a.user_id));

    const lineupPlayerIds = new Set((lineup ?? []).map((l) => l.player_id));
    const filteredMembers = (members ?? []).filter(
        (m) => m.role !== "coach" && (availableUserIds.has(m.user_id) || lineupPlayerIds.has(m.id))
    );

    const { data: setPieces } = await supabase
        .from("set_pieces")
        .select("piece_type, player_id")
        .eq("event_id", eventId);

    return (
        <LineupEditor
            event={event}
            members={filteredMembers}
            existingLineup={lineup ?? []}
            existingSetPieces={setPieces ?? []}
            isAdmin={profile.is_admin}
        />
    );
}
