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
        .select("name, logo_url, primary_color, secondary_color")
        .eq("id", profile.team_id)
        .single()
    : { data: null };

  return (
    <DashboardShell
        teamLogo={team?.logo_url ?? null}
        teamName={team?.name ?? null}
        primaryColor={team?.primary_color ?? "#16a34a"}
        secondaryColor={team?.secondary_color ?? "#ffffff"}
        userName={profile?.name ?? user.email ?? "User"}
        isAdmin={profile?.is_admin ?? false}
    >
      {children}
    </DashboardShell>
  );
}
