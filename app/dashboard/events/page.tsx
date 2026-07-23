"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Event = {
    id: string;
    title: string;
    type: "match" | "training";
    date: string;
    location: string | null;
};

export default function EventsPage() {
    const [events, setEvents] = useState<Event[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();
    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: profile } = await supabase
                .from("profiles")
                .select("team_id, is_admin")
                .eq("user_id", user.id)
                .single();
            if (!profile?.team_id) {
                setLoading(false);
                return;
            }
            setIsAdmin(profile.is_admin);
            const { data } = await supabase
                .from("events")
                .select("id, title, type, date, location")
                .eq("team_id", profile.team_id)
                .order("date", { ascending: true });
            setEvents(data ?? []);
            setLoading(false);
        }
        load();
    }, [supabase]);
    if (loading) {
        return <p className="text-gray-500">Loading...</p>;
    }
    const now = new Date();
    const upcoming = events.filter((e) => new Date(e.date) >= now);
    const past = events.filter((e) => new Date(e.date) < now);
    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-black">Events</h1>
                {isAdmin && (
                    <Link
                        href="/dashboard/events/new"
                        className="rounded-md px-4 py-2 text-sm font-medium"
                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                    >
                        + New Event
                    </Link>
                )}
            </div>
            {events.length === 0 ? (
                <p className="text-gray-500">No events yet.</p>
            ) : (
                <>
                    {upcoming.length > 0 && (
                        <div className="mb-8">
                            <h2 className="text-lg font-bold text-black mb-3">Upcoming</h2>
                            <div className="space-y-3">
                                {upcoming.map((event) => (
                                    <div
                                        key={event.id}
                                        className="rounded-lg bg-white p-4 shadow-sm"
                                    >
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
                                ))}
                            </div>
                        </div>
                    )}
                    {past.length > 0 && (
                        <div>
                            <h2 className="text-lg font-bold text-black mb-3">Past</h2>
                            <div className="space-y-3">
                                {past.map((event) => (
                                    <div
                                        key={event.id}
                                        className="rounded-lg bg-white p-4 shadow-sm opacity-60"
                                    >
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
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}