import { getSessionContext } from "@/lib/session";
import Link from "next/link";
import type { Metadata } from "next";
import DashboardEventList from "@/components/DashboardEventList";
import { getServerT } from "@/lib/server-i18n";
import { pageMetadata } from "@/lib/page-metadata";

/** The dashboard only needs the next few events; the events page has the rest. */
const UPCOMING_LIMIT = 20;

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("nav.dashboard");
}

export default async function DashboardPage() {
  const { supabase, user, profile, team } = await getSessionContext();

  const t = await getServerT();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-gray-500">{t("dashboard.pleaseLogIn")}</p>
      </div>
    );
  }

  const isCoach = profile?.role === "coach";

  if (!profile?.team_id) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-black mb-4">
            {t("dashboard.welcome", { name: profile?.name || t("common.unknown") })}
          </h1>
          <p className="text-gray-600 mb-8">
            {t("dashboard.noTeamYet")}
          </p>
          <div className="space-y-3">
            <Link
              href="/dashboard/create-team"
              className="block w-full rounded-md px-4 py-3 font-medium text-center"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
            >
              {t("dashboard.createTeam")}
            </Link>
            <Link
                href="/dashboard/join-team"
                className="block w-full rounded-md bg-gray-200 px-4 py-3 text-center font-medium text-gray-700 hover:bg-gray-300"
            >
              {t("dashboard.joinTeam")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // The roster count does not depend on the events, so both run together.
  const [{ data: upcomingEvents }, { count: rosterCount }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, type, date, location")
      .eq("team_id", profile.team_id)
      .gte("date", new Date().toISOString())
      .order("date", { ascending: true })
      .limit(UPCOMING_LIMIT),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("team_id", profile.team_id)
      .neq("role", "coach"),
  ]);

  const eventIds = (upcomingEvents ?? []).map((e) => e.id);
  const [availabilityResult, reservationsResult] = await Promise.all([
    eventIds.length > 0
      ? supabase
          .from("availability")
          .select("event_id, status")
          .eq("user_id", user.id)
          .in("event_id", eventIds)
      : Promise.resolve({ data: [] as { event_id: string; status: string }[] }),
    eventIds.length > 0
      ? supabase
          .from("reservations")
          .select("event_id, amount")
          .in("event_id", eventIds)
      : Promise.resolve({ data: [] as { event_id: string; amount: number }[] }),
  ]);
  const statuses: Record<string, string> = Object.fromEntries(
    (availabilityResult.data ?? []).map((a) => [a.event_id, a.status])
  );
  const reservationAmounts: Record<string, number> = Object.fromEntries(
    (reservationsResult.data ?? []).map((r) => [r.event_id, Number(r.amount)])
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-black mb-6">
        {t("dashboard.welcome", { name: profile.name })}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">{t("dashboard.team")}</h3>
          <div className="flex items-center gap-3 mt-1">
            {team?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={team.logo_url} alt={team.name} className="h-10 w-10 rounded-full object-cover" />
            ) : (
                <span className="text-2xl">⚽</span>
            )}
            <p className="text-2xl font-bold text-black">
              {team?.name}
            </p>
          </div>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">{t("dashboard.players")}</h3>
          <p className="text-2xl font-bold text-black mt-1">
            {rosterCount ?? 0}
          </p>
        </div>
        {profile.is_admin && (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500">{t("dashboard.inviteCode")}</h3>
            <p className="text-2xl font-bold mt-1 font-mono" style={{ color: "var(--primary-display)" }}>
              {team?.invite_code}
            </p>
          </div>
        )}
      </div>

      {profile.is_admin && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-black mb-3">{t("dashboard.quickActions")}</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/events/new"
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
            >
              {t("dashboard.newEvent")}
            </Link>
            <Link
              href="/dashboard/roster"
              className="rounded-md bg-gray-200 px-4 py-2 text-gray-700 text-sm font-medium hover:bg-gray-300"
            >
              {t("dashboard.manageRoster")}
            </Link>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold text-black mb-3">{t("dashboard.upcomingEvents")}</h2>
        <DashboardEventList
          events={upcomingEvents ?? []}
          statuses={statuses}
          reservationAmounts={reservationAmounts}
          isCoach={isCoach}
        />
      </div>
    </div>
  );
}
