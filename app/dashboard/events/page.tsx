"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AvailabilityButton from "@/components/AvailabilityButton";

type Event = {
    id: string;
    title: string;
    type: "match" | "training";
    date: string;
    location: string | null;
};

type AvailabilityRow = {
    event_id: string;
    user_id: string;
    status: "available" | "maybe" | "unavailable";
    name: string;
};

export default function EventsPage() {
    const [events, setEvents] = useState<Event[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isCoach, setIsCoach] = useState(false);
    const [currentUserId, setCurrentUserId] = useState("");
    const [loading, setLoading] = useState(true);
    const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
    const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
    const supabase = createClient();

    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setCurrentUserId(user.id);

            const { data: profile } = await supabase
                .from("profiles")
                .select("team_id, is_admin, role")
                .eq("user_id", user.id)
                .single();
            if (!profile?.team_id) {
                setLoading(false);
                return;
            }
            setIsAdmin(profile.is_admin);
            setIsCoach(profile.role === "coach");

            const { data } = await supabase
                .from("events")
                .select("id, title, type, date, location")
                .eq("team_id", profile.team_id)
                .order("date", { ascending: true });
            setEvents(data ?? []);

            const eventIds = (data ?? []).map((e) => e.id);
            if (eventIds.length > 0) {
                const { data: avail } = await supabase
                    .from("availability")
                    .select("event_id, user_id, status")
                    .in("event_id", eventIds);

                const userIds = [...new Set((avail ?? []).map((a) => a.user_id))];
                const { data: profiles } = userIds.length > 0
                    ? await supabase.from("profiles").select("user_id, name, role").in("user_id", userIds)
                    : { data: [] };
                const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, { name: p.name, role: p.role }]));

                setAvailability(
                    (avail ?? [])
                        .filter((a) => profileMap.get(a.user_id)?.role !== "coach")
                        .map((a) => ({
                            event_id: a.event_id,
                            user_id: a.user_id,
                            status: a.status,
                            name: profileMap.get(a.user_id)?.name ?? "Unknown",
                        }))
                );
            }
            setLoading(false);
        }
        load();
    }, [supabase]);

    function getCounts(eventId: string) {
        const rows = availability.filter((a) => a.event_id === eventId);
        return {
            available: rows.filter((a) => a.status === "available").length,
            maybe: rows.filter((a) => a.status === "maybe").length,
            unavailable: rows.filter((a) => a.status === "unavailable").length,
            total: rows.length,
        };
    }

    function myStatus(eventId: string) {
        const row = availability.find(
            (a) => a.event_id === eventId && a.user_id === currentUserId
        );
        return row?.status ?? null;
    }

    function updateAvailability(eventId: string, userId: string, status: "available" | "maybe" | "unavailable") {
        setAvailability((prev) => {
            const existing = prev.find((a) => a.event_id === eventId && a.user_id === userId);
            if (existing) {
                return prev.map((a) =>
                    a.event_id === eventId && a.user_id === userId ? { ...a, status } : a
                );
            }
            return [...prev, { event_id: eventId, user_id: userId, status, name: "You" }];
        });
    }

    if (loading) {
        return <p className="text-gray-500">Loading...</p>;
    }

    const now = new Date();
    const upcoming = events.filter((e) => new Date(e.date) >= now);
    const past = events.filter((e) => new Date(e.date) < now).slice(0, 50);

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
                                {upcoming.map((event) => {
                                    const counts = getCounts(event.id);
                                    return (
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
                                            {!isCoach && (
                                                <AvailabilityButton
                                                    eventId={event.id}
                                                    eventDate={event.date}
                                                    eventType={event.type}
                                                    currentUserId={currentUserId}
                                                    initialStatus={myStatus(event.id)}
                                                    onUpdate={updateAvailability}
                                                />
                                            )}
                                            {isCoach && (
                                                <p className="text-xs text-blue-600 mt-2">Coach — always expected to attend</p>
                                            )}
                                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                                {counts.available > 0 && <span className="text-green-600">{counts.available} yes</span>}
                                                {counts.maybe > 0 && <span className="text-yellow-600">{counts.maybe} maybe</span>}
                                                {counts.unavailable > 0 && <span className="text-red-500">{counts.unavailable} no</span>}
                                                {counts.total > 0 && (
                                                    <button
                                                        onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
                                                        className="underline hover:text-gray-600"
                                                    >
                                                        {expandedEvent === event.id ? "Hide" : "Who"}
                                                    </button>
                                                )}
                                            </div>
                                            {expandedEvent === event.id && (
                                                <div className="mt-2 text-xs space-y-1">
                                                    {availability
                                                        .filter((a) => a.event_id === event.id)
                                                        .sort((a, b) => a.name.localeCompare(b.name))
                                                        .map((a) => (
                                                            <div key={a.user_id} className="flex items-center gap-2">
                                                                <span className={
                                                                    a.status === "available" ? "text-green-600" :
                                                                    a.status === "maybe" ? "text-yellow-600" :
                                                                    "text-red-500"
                                                                }>
                                                                    {a.status === "available" ? "✓" : a.status === "maybe" ? "?" : "✗"}
                                                                </span>
                                                                <span className="text-gray-700">{a.name}</span>
                                                            </div>
                                                        ))}
                                                </div>
                                            )}
                                            {isAdmin && event.type === "match" && (
                                                <Link
                                                    href={`/dashboard/lineup/${event.id}`}
                                                    className="inline-block mt-2 text-xs font-medium text-gray-500 hover:text-gray-700"
                                                >
                                                    ⚽ Set Lineup →
                                                </Link>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {past.length > 0 && (
                        <div>
                            <h2 className="text-lg font-bold text-black mb-3">Past</h2>
                            <div className="space-y-3">
                                {past.map((event) => {
                                    const counts = getCounts(event.id);
                                    return (
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
                                            {counts.total > 0 && (
                                                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                                    {counts.available > 0 && <span>{counts.available} yes</span>}
                                                    {counts.maybe > 0 && <span>{counts.maybe} maybe</span>}
                                                    {counts.unavailable > 0 && <span>{counts.unavailable} no</span>}
                                                </div>
                                            )}
                                            {isAdmin && event.type === "match" && (
                                                <Link
                                                    href={`/dashboard/lineup/${event.id}`}
                                                    className="inline-block mt-2 text-xs font-medium text-gray-500 hover:text-gray-700"
                                                >
                                                    ⚽ View Lineup →
                                                </Link>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
