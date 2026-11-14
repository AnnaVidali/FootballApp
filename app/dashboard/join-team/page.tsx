import JoinTeamClient from "@/components/JoinTeamClient";
import { getSessionContext } from "@/lib/session";

export default async function JoinTeamPage() {
    const { supabase, user, profile } = await getSessionContext();

    let currentTeamName: string | null = null;
    let canLeave = true;

    if (user && profile?.team_id) {
        const [{ data: team }, { data: canLeaveNow }] = await Promise.all([
            supabase.from("teams").select("name").eq("id", profile.team_id).single(),
            supabase.rpc("can_leave_team"),
        ]);
        currentTeamName = team?.name ?? null;
        canLeave = canLeaveNow !== false;
    }

    return <JoinTeamClient currentTeamName={currentTeamName} canLeave={canLeave} />;
}
