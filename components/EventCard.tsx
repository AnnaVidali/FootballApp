"use client";

import { useState } from "react";
import Link from "next/link";
import AvailabilityButton from "@/components/AvailabilityButton";
import EventDate from "@/components/EventDate";
import { useLocaleContext } from "@/lib/i18n-context";
import { intlLocale } from "@/lib/i18n";
import { formatAmount, toDateTimeLocalValue } from "@/lib/utils";

export type Event = {
    id: string;
    title: string;
    type: "match" | "training";
    date: string;
    location: string | null;
    captain_id: string | null;
};

export type AvailabilityRow = {
    event_id: string;
    user_id: string;
    status: "available" | "maybe" | "unavailable";
    name: string;
};

export type EventStatus = "available" | "maybe" | "unavailable";

export type EventCounts = {
    available: number;
    maybe: number;
    unavailable: number;
    total: number;
};

export type EventEditFields = {
    title: string;
    type: "match" | "training";
    date: string;
    location: string;
};

/**
 * One event card, shared by the upcoming and past lists. The two used to be
 * near-identical copies of the same ~120 lines, so every fix had to be made
 * twice. `variant` carries the handful of real differences: past cards are
 * dimmed, hide the RSVP controls and the attendee list, and link to the
 * lineup instead of setting it.
 *
 * The inline edit form lives here too. Its field state is local, so only one
 * card is ever in edit mode and the parent does not have to hold the draft.
 */
export default function EventCard({
    event,
    variant,
    isAdmin,
    isCoach,
    currentUserId,
    counts,
    status,
    reservationAmount,
    captainName,
    availability,
    highlighted,
    expanded,
    onToggleExpanded,
    onSave,
    onDelete,
    onAvailability,
}: {
    event: Event;
    variant: "upcoming" | "past";
    isAdmin: boolean;
    isCoach: boolean;
    currentUserId: string;
    counts: EventCounts;
    status: EventStatus | null;
    reservationAmount: number | undefined;
    captainName: string | undefined;
    availability: AvailabilityRow[];
    highlighted: boolean;
    expanded: boolean;
    onToggleExpanded: () => void;
    onSave: (eventId: string, fields: EventEditFields) => Promise<boolean>;
    onDelete: (eventId: string) => void;
    onAvailability: (eventId: string, userId: string, status: EventStatus) => void;
}) {
    const { t, locale } = useLocaleContext();
    const money = (value: number) => formatAmount(value, intlLocale(locale));
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [fields, setFields] = useState<EventEditFields>(() => ({
        title: event.title,
        type: event.type,
        date: toDateTimeLocalValue(event.date),
        location: event.location ?? "",
    }));

    const isPast = variant === "past";

    function startEdit() {
        // The field is a local wall clock, so it has to be filled with the
        // local time of the event -- the same time the list shows. The raw
        // ISO string holds UTC and would put a different hour in the field.
        setFields({
            title: event.title,
            type: event.type,
            date: toDateTimeLocalValue(event.date),
            location: event.location ?? "",
        });
        setEditing(true);
    }

    function updateFields(patch: Partial<EventEditFields>) {
        setFields((prev) => ({ ...prev, ...patch }));
    }

    async function handleSave() {
        setSaving(true);
        const saved = await onSave(event.id, fields);
        setSaving(false);
        if (saved) setEditing(false);
    }

    return (
        <div
            id={`event-card-${event.id}`}
            className={`rounded-lg bg-white p-4 shadow-sm ${isPast ? "opacity-60" : ""} ${highlighted ? "ring-2 ring-[var(--primary)]" : ""}`}
        >
            {editing ? (
                <div className="space-y-2">
                    <input
                        type="text"
                        value={fields.title}
                        onChange={(e) => updateFields({ title: e.target.value })}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                        placeholder={t("events.eventTitle")}
                    />
                    <div className="flex gap-2">
                        <select
                            value={fields.type}
                            onChange={(e) => updateFields({ type: e.target.value as "match" | "training" })}
                            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                        >
                            <option value="match">{t("events.matchOption")}</option>
                            <option value="training">{t("events.trainingOption")}</option>
                        </select>
                        <input
                            type="datetime-local"
                            value={fields.date}
                            onChange={(e) => updateFields({ date: e.target.value })}
                            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                        />
                    </div>
                    <input
                        type="text"
                        value={fields.location}
                        onChange={(e) => updateFields({ location: e.target.value })}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                        placeholder={t("events.locationOptional")}
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="rounded-md px-3 py-1 text-sm font-medium"
                            style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                        >
                            {saving ? t("common.saving") : t("events.save")}
                        </button>
                        <button
                            onClick={() => setEditing(false)}
                            className="rounded-md bg-gray-200 px-3 py-1 text-sm text-gray-700"
                        >
                            {t("events.cancel")}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="font-medium text-black">{event.title}</p>
                            <p className="text-sm text-gray-500">
                                {event.type === "match" ? t("events.match") : t("events.training")}
                                {" · "}
                                <EventDate date={event.date} />
                                {event.location && ` · ${event.location}`}
                            </p>
                            {captainName && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {t("events.captain", { name: captainName })}
                                </p>
                            )}
                            {reservationAmount ? (
                                <Link
                                    href="/dashboard/reservations"
                                    className="mt-0.5 inline-block text-xs text-gray-400 hover:text-gray-600"
                                >
                                    🏟️ {t("reservations.pitchReserved", { amount: money(reservationAmount) })}
                                </Link>
                            ) : null}
                        </div>
                        {isAdmin && (
                            <div className="flex gap-2 shrink-0 ml-2">
                                <button
                                    onClick={startEdit}
                                    className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                    {t("events.edit")}
                                </button>
                                <button
                                    onClick={() => onDelete(event.id)}
                                    className="text-xs text-gray-400 hover:text-red-500"
                                >
                                    {t("events.delete")}
                                </button>
                            </div>
                        )}
                    </div>

                    {!isPast && !isCoach && (
                        <AvailabilityButton
                            eventId={event.id}
                            eventDate={event.date}
                            currentUserId={currentUserId}
                            initialStatus={status}
                            onUpdate={onAvailability}
                        />
                    )}
                    {!isPast && isCoach && (
                        <p className="text-xs text-blue-600 mt-2">{t("events.coachAttend")}</p>
                    )}

                    {isPast ? (
                        counts.total > 0 && (
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                {counts.available > 0 && <span>{t("events.yesCount", { count: counts.available })}</span>}
                                {counts.maybe > 0 && <span>{t("events.maybeCount", { count: counts.maybe })}</span>}
                                {counts.unavailable > 0 && <span>{t("events.noCount", { count: counts.unavailable })}</span>}
                            </div>
                        )
                    ) : (
                        <>
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                {counts.available > 0 && <span className="text-green-600">{t("events.yesCount", { count: counts.available })}</span>}
                                {counts.maybe > 0 && <span className="text-yellow-600">{t("events.maybeCount", { count: counts.maybe })}</span>}
                                {counts.unavailable > 0 && <span className="text-red-500">{t("events.noCount", { count: counts.unavailable })}</span>}
                                {counts.total > 0 && (
                                    <button
                                        onClick={onToggleExpanded}
                                        className="underline hover:text-gray-600"
                                    >
                                        {expanded ? t("events.hide") : t("events.who")}
                                    </button>
                                )}
                            </div>
                            {expanded && (
                                <div className="mt-2 text-xs space-y-1">
                                    {availability.map((a) => (
                                        <div key={a.user_id} className="flex items-center gap-2">
                                            <span className={
                                                a.status === "available" ? "text-green-600" :
                                                a.status === "maybe" ? "text-yellow-600" :
                                                "text-red-500"
                                            }>
                                                {a.status === "available" ? "\u2713" : a.status === "maybe" ? "?" : "\u2717"}
                                            </span>
                                            <span className="text-gray-700">{a.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {isAdmin && event.type === "match" && (
                        <Link
                            href={`/dashboard/lineup/${event.id}`}
                            className="inline-block mt-2 text-xs font-medium text-gray-500 hover:text-gray-700"
                        >
                            {isPast ? t("events.viewLineup") : t("events.setLineup")}
                        </Link>
                    )}
                </>
            )}
        </div>
    );
}
