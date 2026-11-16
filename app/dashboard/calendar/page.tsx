import type { Metadata } from "next";
import CalendarClient from "@/components/CalendarClient";
import { getSessionContext } from "@/lib/session";
import { pageMetadata } from "@/lib/page-metadata";

type EventRow = {
    id: string;
    title: string;
    type: "match" | "training";
    date: string;
};

type RsvpStatus = "available" | "maybe" | "unavailable";

export async function generateMetadata(): Promise<Metadata> {
    return pageMetadata("nav.calendar");
}

export default async function CalendarPage() {
    const { supabase, user, profile } = await getSessionContext();

    let events: EventRow[] = [];
    const status: Record<string, RsvpStatus> = {};

    if (user && profile?.team_id) {
        // A year either side of today covers any realistic month browsing and
        // keeps the payload flat over several seasons; without a bound this
        // loaded every event the team had ever created.
        const since = new Date();
        since.setFullYear(since.getFullYear() - 1);
        const until = new Date();
        until.setFullYear(until.getFullYear() + 1);

        const { data } = await supabase
            .from("events")
            .select("id, title, type, date")
            .eq("team_id", profile.team_id)
            .gte("date", since.toISOString())
            .lte("date", until.toISOString())
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
