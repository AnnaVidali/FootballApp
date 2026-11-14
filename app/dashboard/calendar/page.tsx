import CalendarClient from "@/components/CalendarClient";
import { getSessionContext } from "@/lib/session";

type EventRow = {
    id: string;
    title: string;
    type: "match" | "training";
    date: string;
};

type RsvpStatus = "available" | "maybe" | "unavailable";

export default async function CalendarPage() {
    const { supabase, user, profile } = await getSessionContext();

    let events: EventRow[] = [];
    const status: Record<string, RsvpStatus> = {};

    if (user && profile?.team_id) {
        const { data } = await supabase
            .from("events")
            .select("id, title, type, date")
            .eq("team_id", profile.team_id)
            .order("date", { ascending: true });

        events = data ?? [];

        if (events.length > 0) {
            const { data: availability } = await supabase
                .from("availability")
                .select("event_id, status")
                .eq("user_id", user.id)
                .in("event_id", events.map((event) => event.id));

            (availability ?? []).forEach((row) => {
                status[row.event_id] = row.status as RsvpStatus;
            });
        }
    }

    return <CalendarClient initialEvents={events} initialStatus={status} />;
}
