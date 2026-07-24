"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "available" | "maybe" | "unavailable";

const statusConfig: Record<Status, { label: string; activeBg: string; inactiveBg: string }> = {
    available: { label: "Yes", activeBg: "bg-green-100 text-green-700 border-green-300", inactiveBg: "bg-white text-gray-500 border-gray-200 hover:border-green-300" },
    maybe: { label: "Maybe", activeBg: "bg-yellow-100 text-yellow-700 border-yellow-300", inactiveBg: "bg-white text-gray-500 border-gray-200 hover:border-yellow-300" },
    unavailable: { label: "No", activeBg: "bg-red-100 text-red-700 border-red-300", inactiveBg: "bg-white text-gray-500 border-gray-200 hover:border-red-300" },
};

function formatTimeLeft(ms: number) {
    if (ms <= 0) return null;
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
}

export default function AvailabilityButton({
    eventId,
    eventDate,
    eventType,
    currentUserId,
    initialStatus,
    onUpdate,
}: {
    eventId: string;
    eventDate: string;
    eventType: string;
    currentUserId: string;
    initialStatus: Status | null;
    onUpdate: (eventId: string, userId: string, status: Status) => void;
}) {
    const supabase = createClient();
    const [selected, setSelected] = useState<Status | null>(initialStatus);
    const [loading, setLoading] = useState(false);
    const deadline = eventType === "match"
        ? new Date(new Date(eventDate).setHours(0, 0, 0, 0))
        : new Date(new Date(eventDate).getTime() - 25 * 60 * 60 * 1000);
    const [timeLeft, setTimeLeft] = useState(deadline.getTime() - Date.now());

    useEffect(() => {
        setSelected(initialStatus);
    }, [initialStatus]);

    useEffect(() => {
        const interval = setInterval(() => {
            setTimeLeft(deadline.getTime() - Date.now());
        }, 1000);
        return () => clearInterval(interval);
    }, [deadline]);

    const closed = timeLeft <= 0;

    async function respond(status: Status) {
        if (closed) return;
        setLoading(true);
        const { error } = await supabase.from("availability").upsert(
            { user_id: currentUserId, event_id: eventId, status },
            { onConflict: "user_id,event_id" }
        );
        if (error) {
            console.error("Availability save error:", error);
            alert("Failed to save: " + error.message);
            setLoading(false);
            return;
        }
        setSelected(status);
        onUpdate(eventId, currentUserId, status);
        setLoading(false);
    }

    if (closed) {
        return <p className="text-xs text-gray-400 mt-2">Availability closed</p>;
    }

    return (
        <div>
            <div className="flex gap-2 mt-2">
                {(["available", "maybe", "unavailable"] as Status[]).map((status) => {
                    const isActive = selected === status;
                    return (
                        <button
                            key={status}
                            onClick={() => respond(status)}
                            disabled={loading}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                isActive ? statusConfig[status].activeBg : statusConfig[status].inactiveBg
                            }`}
                        >
                            {statusConfig[status].label}
                        </button>
                    );
                })}
            </div>
            <p className="text-xs text-gray-400 mt-1">
                Closes in {formatTimeLeft(timeLeft)}
            </p>
        </div>
    );
}
