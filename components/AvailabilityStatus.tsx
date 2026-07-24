"use client";

import { useState, useEffect } from "react";

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

export default function AvailabilityStatus({ eventDate }: { eventDate: string }) {
    const deadline = new Date(new Date(eventDate).getTime() - 24 * 60 * 60 * 1000);
    const [timeLeft, setTimeLeft] = useState(deadline.getTime() - Date.now());

    useEffect(() => {
        const interval = setInterval(() => {
            setTimeLeft(deadline.getTime() - Date.now());
        }, 1000);
        return () => clearInterval(interval);
    }, [deadline]);

    if (timeLeft <= 0) {
        return <p className="text-xs text-gray-400 mt-1">Availability closed</p>;
    }

    return (
        <p className="text-xs text-gray-400 mt-1">
            Closes in {formatTimeLeft(timeLeft)}
        </p>
    );
}
