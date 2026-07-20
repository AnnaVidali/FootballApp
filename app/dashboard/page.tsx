import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role, is_admin, team_id")
    .eq("user_id", user!.id)
    .single();

  if (!profile?.team_id) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-black mb-4">
            Welcome, {profile?.name || "Player"}!
          </h1>
          <p className="text-gray-600 mb-8">
            You&apos;re not on a team yet. Wait for an admin to add you, or
            create your own team.
          </p>
          <div className="space-y-3">
            <Link
              href="/dashboard/create-team"
              className="block w-full rounded-md bg-red-600 px-4 py-3 text-white font-medium hover:bg-red-700 text-center"
            >
              Create a Team
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { data: team } = await supabase
    .from("teams")
    .select("name, invite_code")
    .eq("id", profile.team_id)
    .single();

  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("id, title, type, date, location")
    .eq("team_id", profile.team_id)
    .gte("date", new Date().toISOString())
    .order("date", { ascending: true })
    .limit(5);

  const { data: rosterCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("team_id", profile.team_id);

  return (
    <div>
      <h1 className="text-2xl font-bold text-black mb-6">
        Welcome, {profile.name}!
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Team</h3>
          <p className="text-2xl font-bold text-black mt-1">
            {team?.name}
          </p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Players</h3>
          <p className="text-2xl font-bold text-black mt-1">
            {rosterCount?.length ?? 0}
          </p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Invite Code</h3>
          <p className="text-2xl font-bold text-red-600 mt-1 font-mono">
            {team?.invite_code}
          </p>
        </div>
      </div>

      {profile.is_admin && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-black mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/events/new"
              className="rounded-md bg-red-600 px-4 py-2 text-white text-sm font-medium hover:bg-red-700"
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
        {upcomingEvents && upcomingEvents.length > 0 ? (
          <div className="space-y-3">
            {upcomingEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm"
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
