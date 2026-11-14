import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import { getSessionContext } from "@/lib/session";
import pkg from "../../package.json";

export async function generateMetadata(): Promise<Metadata> {
  return {
    icons: {
      icon: "/api/favicon",
    },
  };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, team } = await getSessionContext();

  if (!user) {
    redirect("/login");
  }

  return (
    <DashboardShell
        teamLogo={team?.logo_url ?? null}
        teamName={team?.name ?? null}
        primaryColor={team?.primary_color ?? "#16a34a"}
        secondaryColor={team?.secondary_color ?? "#ffffff"}
        userName={profile?.name ?? user.email ?? "User"}
        isAdmin={profile?.is_admin ?? false}
        role={profile?.role ?? "player"}
        isOwner={team?.owner_id === user.id}
        appVersion={pkg.version}
    >
      {children}
    </DashboardShell>
  );
}
