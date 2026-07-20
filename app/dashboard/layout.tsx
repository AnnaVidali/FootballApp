import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import SignOutButton from "@/components/SignOutButton";

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
    <div className="flex h-screen overflow-hidden">
      <div className="flex flex-col">
        <Sidebar
          teamName={team?.name ?? null}
          userName={profile?.name ?? user.email ?? "User"}
          isAdmin={profile?.is_admin ?? false}
        />
        <div className="border-t border-gray-200 p-4">
          <SignOutButton />
        </div>
      </div>
      <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
        {children}
      </main>
    </div>
  );
}
