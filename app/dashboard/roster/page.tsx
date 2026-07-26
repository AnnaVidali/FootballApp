import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import RosterClient from "@/components/RosterClient";

export default async function RosterPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
    if (!profile?.team_id) redirect("/dashboard");
    const { data: team } = await supabase
        .from("teams")
        .select("id, name, invite_code, owner_id")
        .eq("id", profile.team_id)
        .single();
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