"use client";

import { useState, useEffect } from "react";
import { formatTimeLeft } from "@/lib/utils";

export default function AvailabilityStatus({ eventDate, eventType }: { eventDate: string; eventType: string }) {
    const [deadline] = useState(() =>
        eventType === "match"
            ? new Date(new Date(eventDate).setHours(0, 0, 0, 0))
            : new Date(new Date(eventDate).getTime() - 25 * 60 * 60 * 1000)
    );
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
