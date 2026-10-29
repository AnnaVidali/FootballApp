"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
import AvailabilityButton from "@/components/AvailabilityButton";
import AlertModal from "@/components/AlertModal";
import ConfirmModal from "@/components/ConfirmModal";
import EventDate from "@/components/EventDate";
import { formatAmount, fromDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/utils";

const supabase = createClient();

type Event = {
    id: string;
    title: string;
    type: "match" | "training";
    date: string;
    location: string | null;
    captain_id: string | null;
};

type AvailabilityRow = {
    event_id: string;
    user_id: string;
    status: "available" | "maybe" | "unavailable";
    name: string;
};

export default function EventsPage() {
    return (
        <Suspense fallback={<EventsFallback />}>
            <EventsContent />
        </Suspense>
    );
}

function EventsFallback() {
    const { t } = useLocaleContext();
    return <p className="text-gray-500" aria-live="polite">{t("common.loading")}</p>;
}

function EventsContent() {
    const [events, setEvents] = useState<Event[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isCoach, setIsCoach] = useState(false);
    const [currentUserId, setCurrentUserId] = useState("");
    const [loading, setLoading] = useState(true);
    const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
    const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
    const [editingEvent, setEditingEvent] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editType, setEditType] = useState<"match" | "training">("match");
    const [editDate, setEditDate] = useState("");
    const [editLocation, setEditLocation] = useState("");
    const [saving, setSaving] = useState(false);
    const [captainNames, setCaptainNames] = useState<Record<string, string>>({});
    const [reservationAmounts, setReservationAmounts] = useState<Record<string, number>>({});
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertMsg, setAlertMsg] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmMsg, setConfirmMsg] = useState("");
    const [pendingDeleteEventId, setPendingDeleteEventId] = useState<string | null>(null);
    const { t } = useLocaleContext();
    const router = useRouter();
    const searchParams = useSearchParams();
    const targetEventId = searchParams.get("eventId");
    const autoTarget = !loading && targetEventId ? targetEventId : null;

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
                .select("id, title, type, date, location, captain_id")
                .eq("team_id", profile.team_id)
                .order("date", { ascending: true });
            setEvents(data ?? []);

            const captainIds = [...new Set((data ?? []).map((e) => e.captain_id).filter(Boolean))] as string[];
            if (captainIds.length > 0) {
                const { data: captainProfiles } = await supabase
                    .from("profiles")
                    .select("id, name")
                    .in("id", captainIds);
                const nameMap: Record<string, string> = {};
                (captainProfiles ?? []).forEach((p) => { nameMap[p.id] = p.name; });
                setCaptainNames(nameMap);
            }

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

            if (eventIds.length > 0) {
                const { data: reservationRows } = await supabase
                    .from("reservations")
                    .select("event_id, amount")
                    .in("event_id", eventIds);
                const amounts: Record<string, number> = {};
                (reservationRows ?? []).forEach((r) => { amounts[r.event_id] = Number(r.amount); });
                setReservationAmounts(amounts);
            }
            setLoading(false);
        }
        load();
    }, []);

    useEffect(() => {
        if (!targetEventId || loading) return;
        const el = document.getElementById(`event-card-${targetEventId}`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const timer = setTimeout(() => {
            router.replace("/dashboard/events");
        }, 3000);
        return () => clearTimeout(timer);
    }, [targetEventId, loading, router]);

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

    function startEdit(event: Event) {
        setEditingEvent(event.id);
        setEditTitle(event.title);
        setEditType(event.type);
        // The field is a local wall clock, so it has to be filled with the
        // local time of the event -- the same time the list shows. The raw
        // ISO string holds UTC and would put a different hour in the field.
        setEditDate(toDateTimeLocalValue(event.date));
        setEditLocation(event.location ?? "");
    }

    async function saveEdit(eventId: string) {
        const current = events.find((e) => e.id === eventId);
        if (!current) return;

        const isoDate = fromDateTimeLocalValue(editDate);
        if (!isoDate) {
            setAlertMsg(t("events.invalidDate"));
            setAlertOpen(true);
            return;
        }

        // The database refuses to turn a training that has a pitch
        // reservation into a match. Say it before the request, so the
        // admin does not lose the whole edit to a database error.
        if (current.type === "training" && editType === "match" && reservationAmounts[eventId]) {
            setAlertMsg(t("events.reservedCannotBeMatch"));
            setAlertOpen(true);
            return;
        }

        // Only send what actually changed. The database has a trigger on
        // `type`, and a payload that mentions the column makes it fire
        // even when the type did not change.
        const patch: { title?: string; type?: "match" | "training"; date?: string; location?: string | null } = {};
        if (editTitle !== current.title) patch.title = editTitle;
        if (editType !== current.type) patch.type = editType;
        if (new Date(isoDate).getTime() !== new Date(current.date).getTime()) patch.date = isoDate;
        const location = editLocation || null;
        if (location !== current.location) patch.location = location;

        if (Object.keys(patch).length === 0) {
            setEditingEvent(null);
            return;
        }

        setSaving(true);
        const { data, error } = await supabase
            .from("events")
            .update(patch)
            .eq("id", eventId)
            .select("id, title, type, date, location")
            .maybeSingle();
        if (error) {
            setAlertMsg(t("events.failedSave") + error.message);
            setAlertOpen(true);
            setSaving(false);
            return;
        }
        if (!data) {
            // No error and no row: the update was filtered out, so nothing
            // was written. Reporting success here is what made a lost edit
            // look like a save that worked.
            setAlertMsg(t("events.notSaved"));
            setAlertOpen(true);
            setSaving(false);
            return;
        }
        setEvents((prev) =>
            prev.map((e) => (e.id === eventId ? { ...e, ...data } : e))
        );
        setEditingEvent(null);
        setSaving(false);
    }

    async function deleteEvent(eventId: string) {
        setConfirmMsg(t("events.deleteConfirm"));
        setPendingDeleteEventId(eventId);
        setConfirmOpen(true);
    }

    async function confirmDeleteEvent() {
        if (!pendingDeleteEventId) return;
        setSaving(true);
        const { error } = await supabase.from("events").delete().eq("id", pendingDeleteEventId);
        if (error) {
            setAlertMsg(t("events.failedDelete") + error.message);
            setAlertOpen(true);
            setSaving(false);
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
        setSaving(false);
    }

    if (loading) {
        return <p className="text-gray-500" aria-live="polite">{t("common.loading")}</p>;
    }

    const now = new Date();
    const upcoming = events.filter((e) => new Date(e.date) >= now);
    const past = events.filter((e) => new Date(e.date) < now).slice(0, 50);

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
                                {upcoming.map((event) => {
                                    const counts = getCounts(event.id);
                                    const openFor = expandedEvent ?? autoTarget;
                                    const isEditing = editingEvent === event.id;
                                    return (
                                        <div
                                            key={event.id}
                                            id={`event-card-${event.id}`}
                                            className={`rounded-lg bg-white p-4 shadow-sm ${autoTarget === event.id ? "ring-2 ring-[var(--primary)]" : ""}`}
                                        >
                                            {isEditing ? (
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        value={editTitle}
                                                        onChange={(e) => setEditTitle(e.target.value)}
                                                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                                        placeholder={t("events.eventTitle")}
                                                    />
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={editType}
                                                            onChange={(e) => setEditType(e.target.value as "match" | "training")}
                                                            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                                        >
                                                            <option value="match">{t("events.matchOption")}</option>
                                                            <option value="training">{t("events.trainingOption")}</option>
                                                        </select>
                                                        <input
                                                            type="datetime-local"
                                                            value={editDate}
                                                            onChange={(e) => setEditDate(e.target.value)}
                                                            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                                        />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={editLocation}
                                                        onChange={(e) => setEditLocation(e.target.value)}
                                                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                                        placeholder={t("events.locationOptional")}
                                                    />
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => saveEdit(event.id)}
                                                            disabled={saving}
                                                            className="rounded-md px-3 py-1 text-sm font-medium"
                                                            style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                                                        >
                                                            {saving ? t("common.saving") : t("events.save")}
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingEvent(null)}
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
                                                                {event.type === "match" ? t("events.match") : t("events.training")} · 
                                                                <EventDate date={event.date} />
                                                                {event.location && ` · ${event.location}`}
                                                            </p>
                                                            {event.captain_id && captainNames[event.captain_id] && (
                                                                <p className="text-xs text-gray-400 mt-0.5">
                                                                    {t("events.captain", { name: captainNames[event.captain_id] })}
                                                                </p>
                                                            )}
                                                            {reservationAmounts[event.id] && (
                                                                <Link
                                                                    href="/dashboard/reservations"
                                                                    className="mt-0.5 inline-block text-xs text-gray-400 hover:text-gray-600"
                                                                >
                                                                    🏟️ {t("reservations.pitchReserved", { amount: formatAmount(reservationAmounts[event.id]) })}
                                                                </Link>
                                                            )}
                                                        </div>
                                                        {isAdmin && (
                                                            <div className="flex gap-2 shrink-0 ml-2">
                                                                <button
                                                                    onClick={() => startEdit(event)}
                                                                    className="text-xs text-gray-400 hover:text-gray-600"
                                                                >
                                                                    {t("events.edit")}
                                                                </button>
                                                                <button
                                                                    onClick={() => deleteEvent(event.id)}
                                                                    className="text-xs text-gray-400 hover:text-red-500"
                                                                >
                                                                    {t("events.delete")}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {!isCoach && (
                                                        <AvailabilityButton
                                                            eventId={event.id}
                                                            eventDate={event.date}
                                                            currentUserId={currentUserId}
                                                            initialStatus={myStatus(event.id)}
                                                            onUpdate={updateAvailability}
                                                        />
                                                    )}
                                                    {isCoach && (
                                                        <p className="text-xs text-blue-600 mt-2">{t("events.coachAttend")}</p>
                                                    )}
                                                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                                        {counts.available > 0 && <span className="text-green-600">{t("events.yesCount", { count: counts.available })}</span>}
                                                        {counts.maybe > 0 && <span className="text-yellow-600">{t("events.maybeCount", { count: counts.maybe })}</span>}
                                                        {counts.unavailable > 0 && <span className="text-red-500">{t("events.noCount", { count: counts.unavailable })}</span>}
                                                        {counts.total > 0 && (
                                                            <button
                                                                onClick={() => { router.replace("/dashboard/events"); setExpandedEvent(expandedEvent === event.id ? null : event.id); }}
                                                                className="underline hover:text-gray-600"
                                                            >
                                                                {openFor === event.id ? t("events.hide") : t("events.who")}
                                                            </button>
                                                        )}
                                                    </div>
                                                    {openFor === event.id && (
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
                                                                            {a.status === "available" ? "\u2713" : a.status === "maybe" ? "?" : "\u2717"}
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
                                                            {t("events.setLineup")}
                                                        </Link>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {past.length > 0 && (
                        <div>
                            <h2 className="text-lg font-bold text-black mb-3">{t("events.past")}</h2>
                            <div className="space-y-3">
                                {past.map((event) => {
                                    const counts = getCounts(event.id);
                                    const isEditing = editingEvent === event.id;
                                    return (
                                        <div
key={event.id}
                                        id={`event-card-${event.id}`}
                                        className={`rounded-lg bg-white p-4 shadow-sm opacity-60 ${autoTarget === event.id ? "ring-2 ring-[var(--primary)]" : ""}`}
                                        >
                                            {isEditing ? (
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        value={editTitle}
                                                        onChange={(e) => setEditTitle(e.target.value)}
                                                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                                        placeholder={t("events.eventTitle")}
                                                    />
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={editType}
                                                            onChange={(e) => setEditType(e.target.value as "match" | "training")}
                                                            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                                        >
                                                            <option value="match">{t("events.matchOption")}</option>
                                                            <option value="training">{t("events.trainingOption")}</option>
                                                        </select>
                                                        <input
                                                            type="datetime-local"
                                                            value={editDate}
                                                            onChange={(e) => setEditDate(e.target.value)}
                                                            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                                        />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={editLocation}
                                                        onChange={(e) => setEditLocation(e.target.value)}
                                                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                                        placeholder={t("events.locationOptional")}
                                                    />
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => saveEdit(event.id)}
                                                            disabled={saving}
                                                            className="rounded-md px-3 py-1 text-sm font-medium"
                                                            style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                                                        >
                                                            {saving ? t("common.saving") : t("events.save")}
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingEvent(null)}
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
                                                                {event.type === "match" ? t("events.match") : t("events.training")} · 
                                                                <EventDate date={event.date} />
                                                                {event.location && ` · ${event.location}`}
                                                            </p>
                                                            {event.captain_id && captainNames[event.captain_id] && (
                                                                <p className="text-xs text-gray-400 mt-0.5">
                                                                    {t("events.captain", { name: captainNames[event.captain_id] })}
                                                                </p>
                                                            )}
                                                            {reservationAmounts[event.id] && (
                                                                <Link
                                                                    href="/dashboard/reservations"
                                                                    className="mt-0.5 inline-block text-xs text-gray-400 hover:text-gray-600"
                                                                >
                                                                    🏟️ {t("reservations.pitchReserved", { amount: formatAmount(reservationAmounts[event.id]) })}
                                                                </Link>
                                                            )}
                                                        </div>
                                                        {isAdmin && (
                                                            <div className="flex gap-2 shrink-0 ml-2">
                                                                <button
                                                                    onClick={() => startEdit(event)}
                                                                    className="text-xs text-gray-400 hover:text-gray-600"
                                                                >
                                                                    {t("events.edit")}
                                                                </button>
                                                                <button
                                                                    onClick={() => deleteEvent(event.id)}
                                                                    className="text-xs text-gray-400 hover:text-red-500"
                                                                >
                                                                    {t("events.delete")}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {counts.total > 0 && (
                                                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                                            {counts.available > 0 && <span>{t("events.yesCount", { count: counts.available })}</span>}
                                                            {counts.maybe > 0 && <span>{t("events.maybeCount", { count: counts.maybe })}</span>}
                                                            {counts.unavailable > 0 && <span>{t("events.noCount", { count: counts.unavailable })}</span>}
                                                        </div>
                                                    )}
                                                    {isAdmin && event.type === "match" && (
                                                        <Link
                                                            href={`/dashboard/lineup/${event.id}`}
                                                            className="inline-block mt-2 text-xs font-medium text-gray-500 hover:text-gray-700"
                                                        >
                                                            {t("events.viewLineup")}
                                                        </Link>
                                                    )}
                                                </>
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
