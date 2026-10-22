import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import DashboardEventList from "@/components/DashboardEventList";
import { getServerT } from "@/lib/server-i18n";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const t = await getServerT();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-gray-500">{t("dashboard.pleaseLogIn")}</p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role, is_admin, team_id")
    .eq("user_id", user.id)
    .single();

  const isCoach = profile?.role === "coach";

  if (!profile?.team_id) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-black mb-4">
            {t("dashboard.welcome", { name: profile?.name || "Player" })}
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

  const { data: team } = await supabase
    .from("teams")
    .select("name, invite_code, logo_url")
    .eq("id", profile.team_id)
    .single();

  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("id, title, type, date, location")
    .eq("team_id", profile.team_id)
    .gte("date", new Date().toISOString())
    .order("date", { ascending: true });

  const eventIds = (upcomingEvents ?? []).map((e) => e.id);
  const { data: myAvailability } = eventIds.length > 0
    ? await supabase
        .from("availability")
        .select("event_id, status")
        .eq("user_id", user.id)
        .in("event_id", eventIds)
    : { data: [] };
  const statuses: Record<string, string> = Object.fromEntries(
    (myAvailability ?? []).map((a) => [a.event_id, a.status])
  );

  const { data: reservationRows } = eventIds.length > 0
    ? await supabase
        .from("reservations")
        .select("event_id, amount")
        .in("event_id", eventIds)
    : { data: [] };
  const reservationAmounts: Record<string, number> = Object.fromEntries(
    (reservationRows ?? []).map((r) => [r.event_id, Number(r.amount)])
  );

  const { count: rosterCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("team_id", profile.team_id)
    .neq("role", "coach");

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
                <img src={team.logo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
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
