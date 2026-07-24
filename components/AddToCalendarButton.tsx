"use client";

import { useState, useRef, useEffect } from "react";

function toGCalDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function toICSDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export default function AddToCalendarButton({
    title,
    date,
    location,
    type,
}: {
    title: string;
    date: string;
    location: string | null;
    type: string;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const start = new Date(date);
    const end = new Date(start.getTime() + (type === "match" ? 120 : 90) * 60 * 1000);

    function googleCalendar() {
        const params = new URLSearchParams({
            action: "TEMPLATE",
            text: title,
            dates: `${toGCalDate(start)}/${toGCalDate(end)}`,
            ...(location ? { location } : {}),
        });
        window.open(`https://calendar.google.com/calendar/render?${params}`, "_blank");
        setOpen(false);
    }

    function downloadICS() {
        const lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//SquadUp//EN",
            "BEGIN:VEVENT",
            `DTSTART:${toICSDate(start)}`,
            `DTEND:${toICSDate(end)}`,
            `SUMMARY:${title}`,
            location ? `LOCATION:${location}` : "",
            "END:VEVENT",
            "END:VCALENDAR",
        ].filter(Boolean).join("\r\n");

        const blob = new Blob([lines], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.ics`;
        a.click();
        URL.revokeObjectURL(url);
        setOpen(false);
    }

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors whitespace-nowrap"
            >
                <span>📅</span>
                <span>Add to calendar</span>
            </button>
            {open && (
                <div className="absolute left-0 mt-1 w-48 rounded-md border border-gray-200 bg-white shadow-lg z-10">
                    <button
                        onClick={googleCalendar}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-md"
                    >
                        Google Calendar
                    </button>
                    <button
                        onClick={downloadICS}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-md border-t border-gray-100"
                    >
                        Apple / Outlook (.ics)
                    </button>
                </div>
            )}
        </div>
    );
}
