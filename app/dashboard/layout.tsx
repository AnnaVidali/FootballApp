import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import { getSessionContext } from "@/lib/session";
import { getServerT } from "@/lib/server-i18n";
import { themeVars } from "@/lib/theme";
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

  // The team colour is rendered into the first byte of HTML. Deriving it in a
  // client effect left every custom-coloured team on the default green until
  // hydration, so the page flashed the wrong colour on every load. The values
  // are validated hex strings, so they cannot break out of the <style>.
  const theme = themeVars(team?.primary_color ?? "#16a34a");
  const t = await getServerT();

  return (
    <>
      <style>{`:root{--primary:${theme.primary};--primary-text:${theme.primaryText};--primary-display:${theme.primaryDisplay}}`}</style>
      <DashboardShell
        teamLogo={team?.logo_url ?? null}
        teamName={team?.name ?? null}
        userName={profile?.name ?? user.email ?? t("common.unknown")}
        isAdmin={profile?.is_admin ?? false}
        role={profile?.role ?? "player"}
        isOwner={team?.owner_id === user.id}
        appVersion={pkg.version}
      >
        {children}
      </DashboardShell>
    </>
  );
}
