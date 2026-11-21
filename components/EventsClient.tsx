"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
import { fromDateTimeLocalValue } from "@/lib/utils";
import { useNow } from "@/lib/use-now";
import AlertModal from "@/components/AlertModal";
import ConfirmModal from "@/components/ConfirmModal";
import EventCard, {
    type AvailabilityRow,
    type Event,
    type EventEditFields,
    type EventStatus,
} from "@/components/EventCard";

const supabase = createClient();

export type { AvailabilityRow, Event };

export type EventsClientProps = {
    initialEvents: Event[];
    initialAvailability: AvailabilityRow[];
    initialCaptainNames: Record<string, string>;
    initialReservationAmounts: Record<string, number>;
    currentUserId: string;
    isAdmin: boolean;
    isCoach: boolean;
    serverNow: string;
};

export default function EventsClient(props: EventsClientProps) {
    return (
        <Suspense fallback={<EventsFallback />}>
            <EventsContent {...props} />
        </Suspense>
    );
}

function EventsFallback() {
    const { t } = useLocaleContext();
    return <p className="text-gray-500" aria-live="polite">{t("common.loading")}</p>;
}

function EventsContent({
    initialEvents,
    initialAvailability,
    initialCaptainNames,
    initialReservationAmounts,
    currentUserId,
    isAdmin,
    isCoach,
    serverNow,
}: EventsClientProps) {
    const searchParams = useSearchParams();
    const targetEventId = searchParams.get("eventId");
    const [events, setEvents] = useState<Event[]>(initialEvents);
    const [availability, setAvailability] = useState<AvailabilityRow[]>(initialAvailability);
    // A deep link opens its card on mount. Dismissing it has to stick after
    // the query string is cleaned up, so the expansion lives in state rather
    // than being recomputed from `targetEventId` on every render.
    const [expandedEvent, setExpandedEvent] = useState<string | null>(targetEventId);
    const [captainNames] = useState<Record<string, string>>(initialCaptainNames);
    const [reservationAmounts, setReservationAmounts] = useState<Record<string, number>>(initialReservationAmounts);
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertMsg, setAlertMsg] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmMsg, setConfirmMsg] = useState("");
    const [pendingDeleteEventId, setPendingDeleteEventId] = useState<string | null>(null);
    const { t } = useLocaleContext();
    const router = useRouter();
    // A ticking clock keeps the upcoming/past split correct on a page left
    // open across kickoff; until hydration, use the exact server instant.
    const nowMs = useNow(60_000);

    useEffect(() => {
        if (!targetEventId) return;
        const el = document.getElementById(`event-card-${targetEventId}`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const timer = setTimeout(() => {
            router.replace("/dashboard/events");
        }, 3000);
        return () => clearTimeout(timer);
    }, [targetEventId, router]);

    function getCounts(eventId: string) {
        const rows = availability.filter((a) => a.event_id === eventId);
        return {
            available: rows.filter((a) => a.status === "available").length,
            maybe: rows.filter((a) => a.status === "maybe").length,
            unavailable: rows.filter((a) => a.status === "unavailable").length,
            total: rows.length,
        };
    }

    function myStatus(eventId: string): EventStatus | null {
        const row = availability.find(
            (a) => a.event_id === eventId && a.user_id === currentUserId
        );
        return row?.status ?? null;
    }

    function updateAvailability(eventId: string, userId: string, status: EventStatus) {
        setAvailability((prev) => {
            const existing = prev.find((a) => a.event_id === eventId && a.user_id === userId);
            if (existing) {
                return prev.map((a) =>
                    a.event_id === eventId && a.user_id === userId ? { ...a, status } : a
                );
            }
            return [...prev, { event_id: eventId, user_id: userId, status, name: t("events.you") }];
        });
    }

    /** Applies one card's edit. Returns whether the card may close its form. */
    async function saveEvent(eventId: string, fields: EventEditFields): Promise<boolean> {
        const current = events.find((e) => e.id === eventId);
        if (!current) return false;

        const isoDate = fromDateTimeLocalValue(fields.date);
        if (!isoDate) {
            setAlertMsg(t("events.invalidDate"));
            setAlertOpen(true);
            return false;
        }

        // The database refuses to turn a training that has a pitch
        // reservation into a match. Say it before the request, so the
        // admin does not lose the whole edit to a database error.
        if (current.type === "training" && fields.type === "match" && reservationAmounts[eventId]) {
            setAlertMsg(t("events.reservedCannotBeMatch"));
            setAlertOpen(true);
            return false;
        }

        // Only send what actually changed. The database has a trigger on
        // `type`, and a payload that mentions the column makes it fire
        // even when the type did not change.
        const patch: { title?: string; type?: "match" | "training"; date?: string; location?: string | null } = {};
        if (fields.title !== current.title) patch.title = fields.title;
        if (fields.type !== current.type) patch.type = fields.type;
        if (new Date(isoDate).getTime() !== new Date(current.date).getTime()) patch.date = isoDate;
        const location = fields.location || null;
        if (location !== current.location) patch.location = location;

        if (Object.keys(patch).length === 0) return true;

        const { data, error } = await supabase
            .from("events")
            .update(patch)
            .eq("id", eventId)
            .select("id, title, type, date, location")
            .maybeSingle();
        if (error) {
            setAlertMsg(t("events.failedSave", { error: error.message }));
            setAlertOpen(true);
            return false;
        }
        if (!data) {
            // No error and no row: the update was filtered out, so nothing
            // was written. Reporting success here is what made a lost edit
            // look like a save that worked.
            setAlertMsg(t("events.notSaved"));
            setAlertOpen(true);
            return false;
        }
        setEvents((prev) =>
            prev.map((e) => (e.id === eventId ? { ...e, ...data } : e))
        );
        return true;
    }

    function deleteEvent(eventId: string) {
        setConfirmMsg(t("events.deleteConfirm"));
        setPendingDeleteEventId(eventId);
        setConfirmOpen(true);
    }

    async function confirmDeleteEvent() {
        if (!pendingDeleteEventId) return;
        const { error } = await supabase.from("events").delete().eq("id", pendingDeleteEventId);
        if (error) {
            setAlertMsg(t("events.failedDelete", { error: error.message }));
            setAlertOpen(true);
            setPendingDeleteEventId(null);
            return;
        }
        setEvents((prev) => prev.filter((e) => e.id !== pendingDeleteEventId));
        setAvailability((prev) => prev.filter((a) => a.event_id !== pendingDeleteEventId));
        setReservationAmounts((prev) => {
            const next = { ...prev };
            delete next[pendingDeleteEventId];
            return next;
        });
        setPendingDeleteEventId(null);
    }

    const now = nowMs ?? Date.parse(serverNow);
    const upcoming = events.filter((e) => new Date(e.date).getTime() >= now);
    const past = events.filter((e) => new Date(e.date).getTime() < now).slice(0, 50);

    function renderCard(event: Event, variant: "upcoming" | "past") {
        return (
            <EventCard
                key={event.id}
                event={event}
                variant={variant}
                isAdmin={isAdmin}
                isCoach={isCoach}
                currentUserId={currentUserId}
                counts={getCounts(event.id)}
                status={myStatus(event.id)}
                reservationAmount={reservationAmounts[event.id]}
                captainName={event.captain_id ? captainNames[event.captain_id] : undefined}
                availability={availability
                    .filter((a) => a.event_id === event.id)
                    .sort((a, b) => a.name.localeCompare(b.name))}
                highlighted={targetEventId === event.id}
                expanded={expandedEvent === event.id}
                onToggleExpanded={() => {
                    if (targetEventId) router.replace("/dashboard/events");
                    setExpandedEvent(expandedEvent === event.id ? null : event.id);
                }}
                onSave={saveEvent}
                onDelete={deleteEvent}
                onAvailability={updateAvailability}
            />
        );
    }

    return (
        <div className="max-w-2xl mx-auto">
            <AlertModal open={alertOpen} title={t("common.error")} message={alertMsg} onClose={() => setAlertOpen(false)} />
            <ConfirmModal
                open={confirmOpen}
                title={t("common.confirm")}
                message={confirmMsg}
                danger
                onConfirm={async () => { setConfirmOpen(false); await confirmDeleteEvent(); }}
                onCancel={() => { setConfirmOpen(false); setPendingDeleteEventId(null); }}
            />
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-black">{t("events.title")}</h1>
                {isAdmin && (
                    <Link
                        href="/dashboard/events/new"
                        className="rounded-md px-4 py-2 text-sm font-medium"
                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                    >
                        {t("events.newEvent")}
                    </Link>
                )}
            </div>
            {events.length === 0 ? (
                <p className="text-gray-500">{t("events.noEvents")}</p>
            ) : (
                <>
                    {upcoming.length > 0 && (
                        <div className="mb-8">
                            <h2 className="text-lg font-bold text-black mb-3">{t("events.upcoming")}</h2>
                            <div className="space-y-3">
                                {upcoming.map((event) => renderCard(event, "upcoming"))}
                            </div>
                        </div>
                    )}
                    {past.length > 0 && (
                        <div>
                            <h2 className="text-lg font-bold text-black mb-3">{t("events.past")}</h2>
                            <div className="space-y-3">
                                {past.map((event) => renderCard(event, "past"))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
