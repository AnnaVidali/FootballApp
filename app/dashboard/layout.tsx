import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role, is_admin, team_id")
    .eq("user_id", user.id)
    .single();

  const { data: team } = profile?.team_id
    ? await supabase
        .from("teams")
        .select("name")
        .eq("id", profile.team_id)
        .single()
    : { data: null };

  return (
    <DashboardShell
        teamName={team?.name ?? null}
        userName={profile?.name ?? user.email ?? "User"}
        isAdmin={profile?.is_admin ?? false}
    >
      {children}
    </DashboardShell>
  );
}
