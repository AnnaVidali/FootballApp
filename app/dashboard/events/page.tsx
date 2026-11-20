import type { Metadata } from "next";
import EventsClient, {
    type AvailabilityRow,
    type Event,
} from "@/components/EventsClient";
import { getSessionContext } from "@/lib/session";
import { getServerT } from "@/lib/server-i18n";
import { pageMetadata } from "@/lib/page-metadata";

const EVENT_COLUMNS = "id, title, type, date, location, captain_id";

export async function generateMetadata(): Promise<Metadata> {
    return pageMetadata("nav.events");
}

export default async function EventsPage() {
    const { supabase, user, profile } = await getSessionContext();

    if (!user || !profile?.team_id) {
        return (
            <EventsClient
                initialEvents={[]}
                initialAvailability={[]}
                initialCaptainNames={{}}
                initialReservationAmounts={{}}
                currentUserId={user?.id ?? ""}
                isAdmin={false}
                isCoach={false}
            />
        );
    }

    // Upcoming first, then the 50 most recent past events. Bounding the
    // past side keeps the payload flat over several seasons.
    const nowIso = new Date().toISOString();
    const [{ data: upcoming }, { data: past }] = await Promise.all([
        supabase
            .from("events")
            .select(EVENT_COLUMNS)
            .eq("team_id", profile.team_id)
            .gte("date", nowIso)
            .order("date", { ascending: true }),
        supabase
            .from("events")
            .select(EVENT_COLUMNS)
            .eq("team_id", profile.team_id)
            .lt("date", nowIso)
            .order("date", { ascending: false })
            .limit(50),
    ]);

    const events: Event[] = [...(upcoming ?? []), ...(past ?? [])];

    const eventIds = events.map((event) => event.id);
    const captainIds = [
        ...new Set(events.map((event) => event.captain_id).filter(Boolean)),
    ] as string[];

    // Captains, availability and reservations all key off the events just
    // loaded and do not depend on each other, so they go out together.
    const [captainResult, availabilityResult, reservationResult] = await Promise.all([
        captainIds.length > 0
            ? supabase.from("profiles").select("id, name").in("id", captainIds)
            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        eventIds.length > 0
            ? supabase
                  .from("availability")
                  .select("event_id, user_id, status")
                  .in("event_id", eventIds)
            : Promise.resolve({
                  data: [] as { event_id: string; user_id: string; status: string }[],
              }),
        eventIds.length > 0
            ? supabase.from("reservations").select("event_id, amount").in("event_id", eventIds)
            : Promise.resolve({ data: [] as { event_id: string; amount: number }[] }),
    ]);

    const captainNames: Record<string, string> = {};
    (captainResult.data ?? []).forEach((captain) => {
        captainNames[captain.id] = captain.name;
    });

    const rows = availabilityResult.data ?? [];
    const userIds = [...new Set(rows.map((row) => row.user_id))];
    const { data: profiles } = userIds.length > 0
        ? await supabase
              .from("profiles")
              .select("user_id, name, role")
              .in("user_id", userIds)
        : { data: [] };
    const profileMap = new Map(
        (profiles ?? []).map((row) => [row.user_id, { name: row.name, role: row.role }]),
    );

    const t = await getServerT();
    const availability: AvailabilityRow[] = rows
        .filter((row) => profileMap.get(row.user_id)?.role !== "coach")
        .map((row) => ({
            event_id: row.event_id,
            user_id: row.user_id,
            status: row.status as AvailabilityRow["status"],
            name: profileMap.get(row.user_id)?.name ?? t("common.unknown"),
        }));

    const reservationAmounts: Record<string, number> = {};
    (reservationResult.data ?? []).forEach((reservation) => {
        reservationAmounts[reservation.event_id] = Number(reservation.amount);
    });

    return (
        <EventsClient
            initialEvents={events}
            initialAvailability={availability}
            initialCaptainNames={captainNames}
            initialReservationAmounts={reservationAmounts}
            currentUserId={user.id}
            isAdmin={profile.is_admin}
            isCoach={profile.role === "coach"}
        />
    );
}
