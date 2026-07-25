import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import AddToCalendarButton from "@/components/AddToCalendarButton";
import AvailabilityStatus from "@/components/AvailabilityStatus";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-gray-500">Please log in.</p>
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
            Welcome, {profile?.name || "Player"}!
          </h1>
          <p className="text-gray-600 mb-8">
            You&apos;re not on a team yet. Create your own or join one with an invite code.
          </p>
          <div className="space-y-3">
            <Link
              href="/dashboard/create-team"
              className="block w-full rounded-md px-4 py-3 font-medium text-center"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
            >
              Create a Team
            </Link>
            <Link
                href="/dashboard/join-team"
                className="block w-full rounded-md bg-gray-200 px-4 py-3 text-center font-medium text-gray-700 hover:bg-gray-300"
            >
              Join a Team
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
  const myStatusMap = new Map((myAvailability ?? []).map((a) => [a.event_id, a.status]));

  const now = new Date();

  function getDeadline(event: { date: string; type: string }) {
    return event.type === "match"
      ? new Date(new Date(event.date).setHours(0, 0, 0, 0))
      : new Date(new Date(event.date).getTime() - 25 * 60 * 60 * 1000);
  }

  const visibleEvents = isCoach
    ? (upcomingEvents ?? [])
    : (upcomingEvents ?? []).filter((e) => {
        const status = myStatusMap.get(e.id);
        const deadline = getDeadline(e);
        const closed = now > deadline;

        // After deadline: unavailable and maybe are treated as "don't show"
        if (closed) {
          if (status === "unavailable" || status === "maybe") return false;
          if (!status) return false; // missed the deadline entirely
          return true; // voted available
        }

        // Before deadline: show everything (vote or not)
        return true;
      });

  const { count: rosterCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("team_id", profile.team_id)
    .neq("role", "coach");

  return (
    <div>
      <h1 className="text-2xl font-bold text-black mb-6">
        Welcome, {profile.name}!
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Team</h3>
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
          <h3 className="text-sm font-medium text-gray-500">Players</h3>
          <p className="text-2xl font-bold text-black mt-1">
            {rosterCount ?? 0}
          </p>
        </div>
        {profile.is_admin && (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500">Invite Code</h3>
            <p className="text-2xl font-bold mt-1 font-mono" style={{ color: "var(--primary-display)" }}>
              {team?.invite_code}
            </p>
          </div>
        )}
      </div>

      {profile.is_admin && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-black mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/events/new"
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
            >
              + New Event
            </Link>
            <Link
              href="/dashboard/roster"
              className="rounded-md bg-gray-200 px-4 py-2 text-gray-700 text-sm font-medium hover:bg-gray-300"
            >
              Manage Roster
            </Link>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold text-black mb-3">Upcoming Events</h2>
        {visibleEvents.length > 0 ? (
          <div className="space-y-3">
            {visibleEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-lg bg-white p-4 shadow-sm"
              >
                <div>
                  <p className="font-medium text-black">{event.title}</p>
                  <p className="text-sm text-gray-500">
                    {event.type === "match" ? "⚽ Match" : "🏃 Training"} ·{" "}
                    {new Date(event.date).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {event.location && ` · ${event.location}`}
                  </p>
                   {!isCoach && (() => {
                    const deadline = getDeadline(event);
                    const closed = now > deadline;
                    const status = myStatusMap.get(event.id);
                    if (closed) return null;
                    if (status === "maybe") {
                      return (
                        <p className="text-xs text-yellow-600 mt-1">
                          You answered Maybe — pick Yes or No before it closes
                        </p>
                      );
                    }
                    if (!status) {
                      return (
                        <p className="text-xs text-gray-400 mt-1">
                          Mark your availability
                        </p>
                      );
                    }
                    return null;
                  })()}
                   {!isCoach && <AvailabilityStatus eventDate={event.date} eventType={event.type} />}
                  <div className="mt-2">
                    <AddToCalendarButton
                      title={event.title}
                      date={event.date}
                      location={event.location}
                      type={event.type}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No upcoming events.</p>
        )}
      </div>
    </div>
  );
}
