"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import LineupEditor from "@/components/LineupEditor";

type Event = {
    id: string;
    title: string;
    type: string;
    date: string;
    location: string | null;
    formation: string | null;
};

type Member = {
    id: string;
    user_id: string;
    name: string;
    position: string | null;
    shirt_number: number | null;
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

export default function LineupPage() {
    const supabase = createClient();
    const [events, setEvents] = useState<Event[]>([]);
    const [allMembers, setAllMembers] = useState<Member[]>([]);
    const [filteredMembers, setFilteredMembers] = useState<Member[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [lineup, setLineup] = useState<LineupEntry[]>([]);
    const [setPieces, setSetPieces] = useState<SetPiece[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

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

            const { data: teamMembers } = await supabase
                .from("profiles")
                .select("id, user_id, name, position, shirt_number")
                .eq("team_id", profile.team_id)
                .order("name");
            setAllMembers(teamMembers ?? []);

            const { data: upcoming } = await supabase
                .from("events")
                .select("id, title, type, date, location, formation")
                .eq("team_id", profile.team_id)
                .eq("type", "match")
                .gte("date", new Date().toISOString())
                .order("date", { ascending: true });
            setEvents(upcoming ?? []);

            if (upcoming && upcoming.length > 0) {
                setSelectedEventId(upcoming[0].id);
            } else {
                setLoading(false);
            }
        }
        load();
    }, [supabase]);

    const loadLineup = useCallback(async (eventId: string) => {
        const { data } = await supabase
            .from("lineups")
            .select("player_id, position, shirt_number, pos_x, pos_y")
            .eq("event_id", eventId);
        setLineup(data ?? []);

        const { data: sp } = await supabase
            .from("set_pieces")
            .select("piece_type, player_id")
            .eq("event_id", eventId);
        setSetPieces(sp ?? []);

        const { data: available } = await supabase
            .from("availability")
            .select("user_id")
            .eq("event_id", eventId)
            .eq("status", "available");
        const availableUserIds = new Set((available ?? []).map((a) => a.user_id));
        const lineupPlayerIds = new Set((data ?? []).map((l) => l.player_id));
        setFilteredMembers(
            allMembers.filter((m) => availableUserIds.has(m.user_id) || lineupPlayerIds.has(m.id))
        );

        setLoading(false);
    }, [supabase, allMembers]);

    useEffect(() => {
        if (selectedEventId) {
            setLoading(true);
            loadLineup(selectedEventId);
        }
    }, [selectedEventId, loadLineup]);

    const selectedEvent = events.find((e) => e.id === selectedEventId);

    if (events.length === 0 && !loading) {
        return (
            <div className="max-w-2xl mx-auto">
                <h1 className="text-2xl font-bold text-black mb-6">Lineup</h1>
                <p className="text-gray-500">No upcoming matches.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row gap-6">
            {/* Editor */}
            <div className="flex-1 min-w-0">
                {selectedEvent && (
                    <LineupEditor
                        event={selectedEvent}
                        members={filteredMembers}
                        existingLineup={lineup}
                        existingSetPieces={setPieces}
                        isAdmin={isAdmin}
                    />
                )}
            </div>

            {/* Match list */}
            <div className="w-full md:w-72 shrink-0">
                <h2 className="font-bold text-black mb-3">Matches</h2>
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
                                {new Date(event.date).toLocaleDateString("en-GB", {
                                    weekday: "short",
                                    day: "numeric",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
