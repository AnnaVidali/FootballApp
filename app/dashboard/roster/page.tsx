import { redirect } from "next/navigation";
import RosterClient from "@/components/RosterClient";
import { getSessionContext } from "@/lib/session";

export default async function RosterPage() {
    const { supabase, user, profile, team } = await getSessionContext();
    if (!user) redirect("/login");
    if (!profile?.team_id) redirect("/dashboard");
    const { data: members } = await supabase
        .from("profiles")
        .select("id, user_id, name, position, shirt_number, is_admin, role")
        .eq("team_id", profile.team_id)
        .order("name");
    return (
        <RosterClient
            inviteCode={team?.invite_code ?? ""}
            members={members ?? []}
            isAdmin={profile.is_admin}
            currentUserId={user.id}
            ownerId={team?.owner_id ?? ""}
        />
    );
}
