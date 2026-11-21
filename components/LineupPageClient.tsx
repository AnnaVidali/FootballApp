"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
import LineupEditor from "@/components/LineupEditor";
import EventDate from "@/components/EventDate";

const supabase = createClient();

type Event = {
    id: string;
    title: string;
    type: string;
    date: string;
    location: string | null;
    formation: string | null;
    captain_id: string | null;
};

type Member = {
    id: string;
    user_id: string;
    name: string;
    position: string | null;
    shirt_number: number | null;
    role: string;
};

type LineupEntry = {
    player_id: string;
    position: string;
    shirt_number: number | null;
    pos_x: number | null;
    pos_y: number | null;
};

type SetPiece = {
    piece_type: string;
    player_id: string;
};

export default function LineupPageClient({
    initialEvents,
    initialMembers,
    isAdmin,
    serverNow,
}: {
    initialEvents: Event[];
    initialMembers: Member[];
    isAdmin: boolean;
    serverNow: string;
}) {
    const [events] = useState<Event[]>(initialEvents);
    const [allMembers] = useState<Member[]>(initialMembers);
    const [filteredMembers, setFilteredMembers] = useState<Member[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<string | null>(
        initialEvents[0]?.id ?? null
    );
    const [lineup, setLineup] = useState<LineupEntry[]>([]);
    const [setPieces, setSetPieces] = useState<SetPiece[]>([]);
    const { t } = useLocaleContext();

    const loadLineup = useCallback(async (eventId: string) => {
        // The three lookups are independent, so they go out together rather
        // than one after the other.
        const [{ data }, { data: sp }, { data: available }] = await Promise.all([
            supabase
                .from("lineups")
                .select("player_id, position, shirt_number, pos_x, pos_y")
                .eq("event_id", eventId),
            supabase
                .from("set_pieces")
                .select("piece_type, player_id")
                .eq("event_id", eventId),
            supabase
                .from("availability")
                .select("user_id")
                .eq("event_id", eventId)
                .eq("status", "available"),
        ]);
        setLineup(data ?? []);
        setSetPieces(sp ?? []);

        const availableUserIds = new Set((available ?? []).map((a) => a.user_id));
        const lineupPlayerIds = new Set((data ?? []).map((l) => l.player_id));
        setFilteredMembers(
            allMembers.filter((m) => m.role !== "coach" && (availableUserIds.has(m.user_id) || lineupPlayerIds.has(m.id)))
        );
    }, [allMembers]);

    useEffect(() => {
        if (!selectedEventId) return;
        // The load is started from a timer so the state updates it triggers
        // are not a synchronous part of the effect body.
        const timer = setTimeout(() => {
            void loadLineup(selectedEventId);
        }, 0);
        return () => clearTimeout(timer);
    }, [selectedEventId, loadLineup]);

    const selectedEvent = events.find((e) => e.id === selectedEventId);

    if (events.length === 0) {
        return (
            <div className="max-w-2xl mx-auto">
                <h1 className="text-2xl font-bold text-black mb-6">{t("lineup.title")}</h1>
                <p className="text-gray-500">{t("lineup.noUpcomingMatches")}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 min-w-0">
                {selectedEvent && (
                    <LineupEditor
                        event={selectedEvent}
                        members={filteredMembers}
                        existingLineup={lineup}
                        existingSetPieces={setPieces}
                        isAdmin={isAdmin}
                        serverNow={serverNow}
                    />
                )}
            </div>

            <div className="w-full md:w-72 shrink-0">
                <h2 className="font-bold text-black mb-3">{t("lineup.matches")}</h2>
                <div className="space-y-2">
                    {events.map((event) => (
                        <button
                            key={event.id}
                            onClick={() => setSelectedEventId(event.id)}
                            className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                                selectedEventId === event.id
                                    ? "border-gray-400 bg-gray-100 font-medium text-black"
                                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                            }`}
                        >
                            <p className="font-medium truncate">{event.title}</p>
                            <p className="text-xs text-gray-400">
                                <EventDate date={event.date} />
                            </p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
