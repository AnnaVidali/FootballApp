"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
import { equalShare, formatAmount, getAvailabilityDeadline } from "@/lib/utils";
import AlertModal from "@/components/AlertModal";
import ConfirmModal from "@/components/ConfirmModal";
import EventDate from "@/components/EventDate";
import type { Reservation, ReservationPayment } from "@/types/database";

const supabase = createClient();

type TrainingEvent = {
    id: string;
    title: string;
    type: "match" | "training";
    date: string;
    location: string | null;
};

type Member = {
    id: string;
    user_id: string;
    name: string;
    role: string;
};

type AvailabilityRow = {
    event_id: string;
    user_id: string;
    status: string;
};

const PAYMENT_COLUMNS = "id, reservation_id, user_id, amount, paid, paid_at, created_at";

export default function ReservationsPage() {
    const [loading, setLoading] = useState(true);
    const [myProfileId, setMyProfileId] = useState<string | null>(null);
    const [hasTeam, setHasTeam] = useState(true);
    const [members, setMembers] = useState<Member[]>([]);
    const [events, setEvents] = useState<TrainingEvent[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [payments, setPayments] = useState<ReservationPayment[]>([]);
    const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
    const [amounts, setAmounts] = useState<Record<string, string>>({});
    const [openForm, setOpenForm] = useState<string | null>(null);
    const [editingEvent, setEditingEvent] = useState<string | null>(null);
    const [editAmount, setEditAmount] = useState("");
    const [confirmCancel, setConfirmCancel] = useState<Reservation | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [splitFor, setSplitFor] = useState<string | null>(null);
    const [ticked, setTicked] = useState<string[]>([]);
    const [reloadKey, setReloadKey] = useState(0);
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertMsg, setAlertMsg] = useState("");
    const { t, locale } = useLocaleContext();

    const dateFmt = locale === "es" ? "es-ES" : "en-GB";

    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setLoading(false);
                return;
            }

            const { data: profile } = await supabase
                .from("profiles")
                .select("id, team_id, is_admin")
                .eq("user_id", user.id)
                .single();
            if (!profile?.team_id) {
                setHasTeam(false);
                setLoading(false);
                return;
            }
            setMyProfileId(profile.id);
            setIsAdmin(profile.is_admin);
            setHasTeam(true);

            const { data: memberRows } = await supabase
                .from("profiles")
                .select("id, user_id, name, role")
                .eq("team_id", profile.team_id);
            setMembers((memberRows ?? []) as Member[]);

            // Reservations only ever exist for trainings.
            const { data: eventRows } = await supabase
                .from("events")
                .select("id, title, type, date, location")
                .eq("team_id", profile.team_id)
                .eq("type", "training")
                .order("date", { ascending: true });
            const trainings = (eventRows ?? []) as TrainingEvent[];
            setEvents(trainings);

            const eventIds = trainings.map((e) => e.id);
            if (eventIds.length === 0) {
                setReservations([]);
                setPayments([]);
                setAvailability([]);
                setLoading(false);
                return;
            }

            const { data: avail } = await supabase
                .from("availability")
                .select("event_id, user_id, status")
                .in("event_id", eventIds);
            setAvailability((avail ?? []) as AvailabilityRow[]);

            const { data: reservationRows } = await supabase
                .from("reservations")
                .select("id, event_id, created_by, amount, closed_at, created_at")
                .in("event_id", eventIds);
            const loadedReservations = (reservationRows ?? []) as Reservation[];
            setReservations(loadedReservations);

            const reservationIds = loadedReservations.map((r) => r.id);
            if (reservationIds.length === 0) {
                setPayments([]);
                setLoading(false);
                return;
            }

            const { data: paymentRows } = await supabase
                .from("reservation_payments")
                .select(PAYMENT_COLUMNS)
                .in("reservation_id", reservationIds);
            const loadedPayments = (paymentRows ?? []) as ReservationPayment[];
            setPayments(loadedPayments);

            // The split is never triggered automatically: once the deadline
            // passes, the reservation's creator (or an admin) picks who was
            // there and confirms the split explicitly.

            setLoading(false);
        }
        load();
    }, [reloadKey]);

    const memberById = useMemo(
        () => new Map(members.map((m) => [m.id, m])),
        [members]
    );

    const reservationByEvent = useMemo(
        () => new Map(reservations.map((r) => [r.event_id, r])),
        [reservations]
    );

    const paymentsByReservation = useMemo(() => {
        const map = new Map<string, ReservationPayment[]>();
        payments.forEach((p) => {
            const list = map.get(p.reservation_id) ?? [];
            list.push(p);
            map.set(p.reservation_id, list);
        });
        return map;
    }, [payments]);

    // Profiles of the players who said "available" for an event (coaches never RSVP).
    const yesProfileIds = useCallback(
        (eventId: string) => {
            const userIds = new Set(
                availability
                    .filter((a) => a.event_id === eventId && a.status === "available")
                    .map((a) => a.user_id)
            );
            return members.filter((m) => userIds.has(m.user_id) && m.role !== "coach").map((m) => m.id);
        },
        [availability, members]
    );

    function parseAmount(raw: string): number | null {
        const normalized = raw.replace(",", ".").trim();
        const value = Number(normalized);
        if (!normalized || !Number.isFinite(value) || value <= 0) return null;
        return Math.round(value * 100) / 100;
    }

    async function reserve(event: TrainingEvent) {
        if (!myProfileId) return;
        const amount = parseAmount(amounts[event.id] ?? "");
        if (amount === null) {
            setAlertMsg(t("reservations.invalidAmount"));
            setAlertOpen(true);
            return;
        }
        setBusyId(event.id);
        const { error } = await supabase.from("reservations").insert({
            event_id: event.id,
            created_by: myProfileId,
            amount,
        });
        if (error) {
            setAlertMsg(
                error.code === "23505"
                    ? t("reservations.alreadyReserved")
                    : t("reservations.reserveFailed") + error.message
            );
            setAlertOpen(true);
            setBusyId(null);
            return;
        }
        setAmounts((prev) => ({ ...prev, [event.id]: "" }));
        setOpenForm(null);
        setBusyId(null);
        setReloadKey((key) => key + 1);
    }

    async function saveAmount(reservation: Reservation) {
        const amount = parseAmount(editAmount);
        if (amount === null) {
            setAlertMsg(t("reservations.invalidAmount"));
            setAlertOpen(true);
            return;
        }
        setBusyId(reservation.id);
        const { error } = await supabase
            .from("reservations")
            .update({ amount })
            .eq("id", reservation.id);
        if (error) {
            setAlertMsg(t("reservations.updateFailed") + error.message);
            setAlertOpen(true);
            setBusyId(null);
            return;
        }
        setEditingEvent(null);
        setBusyId(null);
        setReloadKey((key) => key + 1);
    }

    async function cancelReservation(reservation: Reservation) {
        setBusyId(reservation.id);
        const { error } = await supabase.from("reservations").delete().eq("id", reservation.id);
        if (error) {
            setAlertMsg(t("reservations.cancelFailed") + error.message);
            setAlertOpen(true);
            setBusyId(null);
            return;
        }
        setBusyId(null);
        setReloadKey((key) => key + 1);
    }

    async function refreshPayments(reservationId: string) {
        const { data: refreshed } = await supabase
            .from("reservation_payments")
            .select(PAYMENT_COLUMNS)
            .eq("reservation_id", reservationId);
        const rows = (refreshed ?? []) as ReservationPayment[];
        setPayments((prev) => [
            ...prev.filter((p) => p.reservation_id !== reservationId),
            ...rows,
        ]);
    }

    async function saveSplit(reservation: Reservation, editing: boolean) {
        if (ticked.length === 0) return;
        setBusyId(reservation.id);
        const { error } = editing
            ? await supabase.rpc("update_reservation_split", {
                  p_reservation_id: reservation.id,
                  p_participants: ticked,
              })
            : await supabase.rpc("finalize_reservation_split", {
                  p_reservation_id: reservation.id,
                  p_participants: ticked,
                  p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              });
        if (error) {
            setAlertMsg(
                (editing
                    ? t("reservations.updateSplitFailed")
                    : t("reservations.finalizeFailed")) + error.message
            );
            setAlertOpen(true);
            setBusyId(null);
            return;
        }
        await refreshPayments(reservation.id);
        setSplitFor(null);
        setTicked([]);
        setBusyId(null);
    }

    async function closeReservation(reservation: Reservation) {
        setBusyId(reservation.id);
        const { error } = await supabase.rpc("close_reservation", {
            p_reservation_id: reservation.id,
        });
        if (error) {
            setAlertMsg(t("reservations.closeFailed") + error.message);
            setAlertOpen(true);
            setBusyId(null);
            return;
        }
        const closedAt = new Date().toISOString();
        setReservations((prev) =>
            prev.map((r) => (r.id === reservation.id ? { ...r, closed_at: closedAt } : r))
        );
        setBusyId(null);
    }

    async function reopenReservation(reservation: Reservation) {
        setBusyId(reservation.id);
        const { error } = await supabase.rpc("reopen_reservation", {
            p_reservation_id: reservation.id,
        });
        if (error) {
            setAlertMsg(t("reservations.reopenFailed") + error.message);
            setAlertOpen(true);
            setBusyId(null);
            return;
        }
        setReservations((prev) =>
            prev.map((r) => (r.id === reservation.id ? { ...r, closed_at: null } : r))
        );
        setBusyId(null);
    }

    async function togglePaid(payment: ReservationPayment) {
        setBusyId(payment.id);
        const paid = !payment.paid;
        // paid_at is stamped by the database (see migration 019).
        const { error } = await supabase
            .from("reservation_payments")
            .update({ paid })
            .eq("id", payment.id);
        if (error) {
            setAlertMsg(t("reservations.updateFailed") + error.message);
            setAlertOpen(true);
            setBusyId(null);
            return;
        }
        setPayments((prev) => prev.map((p) => (p.id === payment.id ? { ...p, paid } : p)));
        setBusyId(null);
    }

    function renderSplitPicker(reservation: Reservation, editing: boolean) {
        const roster = members
            .filter((m) => m.role !== "coach")
            .sort((a, b) => a.name.localeCompare(b.name));
        const previewShare = equalShare(Number(reservation.amount), ticked.length);

        return (
            <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
                <p className="text-sm font-medium text-black">
                    {t("reservations.splitTitle")}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                    {t("reservations.splitHint")}
                </p>
                <div className="mt-2 flex flex-col gap-1">
                    {roster.map((m) => {
                        const on = ticked.includes(m.id);
                        return (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() =>
                                    setTicked((prev) =>
                                        on
                                            ? prev.filter((id) => id !== m.id)
                                            : [...prev, m.id]
                                    )
                                }
                                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                                    on
                                        ? "bg-green-50 text-green-800"
                                        : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                                }`}
                            >
                                <span aria-hidden="true">{on ? "✓" : "○"}</span>
                                <span className="truncate">{m.name}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-gray-600">
                        <p>
                            {ticked.length > 0
                                ? t("reservations.splitPreview", {
                                      count: ticked.length,
                                      amount: formatAmount(previewShare),
                                  })
                                : t("reservations.splitMinOne")}
                        </p>
                        {ticked.length > 0 && (
                            <p className="mt-0.5 text-gray-400">
                                {t("reservations.splitRounding")}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => saveSplit(reservation, editing)}
                            disabled={busyId === reservation.id || ticked.length === 0}
                            className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                            style={{
                                backgroundColor: "var(--primary)",
                                color: "var(--primary-text)",
                            }}
                        >
                            {editing
                                ? t("reservations.saveSplit")
                                : t("reservations.confirmSplit")}
                        </button>
                        <button
                            onClick={() => {
                                setSplitFor(null);
                                setTicked([]);
                            }}
                            className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                        >
                            {t("common.cancel")}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    function renderTraining(event: TrainingEvent) {
        const reservation = reservationByEvent.get(event.id);
        const deadline = getAvailabilityDeadline(event);
        const closed = new Date() > deadline;
        const yesCount = yesProfileIds(event.id).length;
        const isCreatorOrAdmin =
            reservation !== undefined &&
            (reservation.created_by === myProfileId || isAdmin);
        const canManage =
            reservation !== undefined &&
            (reservation.created_by === myProfileId || isAdmin) &&
            (paymentsByReservation.get(reservation.id)?.length ?? 0) === 0;

        return (
            <div key={event.id} className="rounded-lg bg-white p-4 shadow-sm">
                <p className="font-medium text-black">{event.title}</p>
                <p className="text-sm text-gray-500">
                    {t("events.training")} · <EventDate date={event.date} />
                    {event.location && ` · ${event.location}`}
                </p>

                {!reservation && (
                    <div className="mt-3">
                        {openForm === event.id ? (
                            <div className="flex flex-wrap items-end gap-2">
                                <div>
                                    <label
                                        htmlFor={`reservation-amount-${event.id}`}
                                        className="block text-xs font-medium text-gray-500 mb-1"
                                    >
                                        {t("reservations.amountLabel")}
                                    </label>
                                    <input
                                        id={`reservation-amount-${event.id}`}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        inputMode="decimal"
                                        value={amounts[event.id] ?? ""}
                                        onChange={(e) =>
                                            setAmounts((prev) => ({ ...prev, [event.id]: e.target.value }))
                                        }
                                        placeholder={t("reservations.amountPlaceholder")}
                                        className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                                    />
                                </div>
                                <button
                                    onClick={() => reserve(event)}
                                    disabled={busyId === event.id}
                                    className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                                    style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                                >
                                    {busyId === event.id ? t("reservations.reserving") : t("reservations.reserve")}
                                </button>
                                <button
                                    onClick={() => setOpenForm(null)}
                                    className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                                >
                                    {t("reservations.cancel")}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setOpenForm(event.id)}
                                className="rounded-md px-4 py-2 text-sm font-medium"
                                style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                            >
                                {t("reservations.reservePitch")}
                            </button>
                        )}
                    </div>
                )}

                {reservation && (
                    <div className="mt-3 rounded-md bg-gray-50 p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-lg font-bold text-black">
                                {formatAmount(Number(reservation.amount))}
                            </p>
                            <p className="text-xs text-gray-500">
                                {t("reservations.reservedBy", {
                                    name:
                                        memberById.get(reservation.created_by)?.name ??
                                        t("common.none"),
                                })}
                            </p>
                        </div>

                        {reservation.created_by === myProfileId && (
                            <p className="text-xs text-gray-500 mt-0.5">{t("reservations.youCovered")}</p>
                        )}

                        {canManage &&
                            (editingEvent === event.id ? (
                                <div className="mt-2 flex flex-wrap items-end gap-2">
                                    <div>
                                        <label
                                            htmlFor={`reservation-edit-${event.id}`}
                                            className="block text-xs font-medium text-gray-500 mb-1"
                                        >
                                            {t("reservations.amountLabel")}
                                        </label>
                                        <input
                                            id={`reservation-edit-${event.id}`}
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            inputMode="decimal"
                                            value={editAmount}
                                            onChange={(e) => setEditAmount(e.target.value)}
                                            className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-black"
                                        />
                                    </div>
                                    <button
                                        onClick={() => saveAmount(reservation)}
                                        disabled={busyId === reservation.id}
                                        className="rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                                    >
                                        {t("common.save")}
                                    </button>
                                    <button
                                        onClick={() => setEditingEvent(null)}
                                        className="rounded-md bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300"
                                    >
                                        {t("common.cancel")}
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-1 flex gap-3 text-xs">
                                    <button
                                        onClick={() => {
                                            setEditingEvent(event.id);
                                            setEditAmount(String(reservation.amount));
                                        }}
                                        className="text-gray-400 hover:text-gray-600"
                                    >
                                        {t("reservations.editAmount")}
                                    </button>
                                    <button
                                        onClick={() => setConfirmCancel(reservation)}
                                        className="text-gray-400 hover:text-red-500"
                                    >
                                        {t("reservations.cancelReservation")}
                                    </button>
                                </div>
                            ))}

                        {!closed ? (
                            <div className="mt-2">
                                <p className="text-sm text-gray-600">
                                    {t("reservations.splitAfterDeadline", {
                                        date: deadline.toLocaleDateString(dateFmt, {
                                            weekday: "short",
                                            day: "numeric",
                                            month: "short",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        }),
                                    })}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {t("reservations.availableCount", { count: yesCount })}
                                </p>
                            </div>
                        ) : (
                            (() => {
                                const rows = [...(paymentsByReservation.get(reservation.id) ?? [])].sort(
                                    (a, b) =>
                                        (memberById.get(a.user_id)?.name ?? "").localeCompare(
                                            memberById.get(b.user_id)?.name ?? ""
                                        )
                                );
                                const total = rows.reduce((sum, p) => sum + Number(p.amount), 0);
                                const paidRows = rows.filter((p) => p.paid);
                                const paidTotal = paidRows.reduce((sum, p) => sum + Number(p.amount), 0);
                                // Every row holds the same share, rounded to the nearest
                                // cent (standard rounding).
                                const share = equalShare(Number(reservation.amount), rows.length);

                                if (rows.length === 0) {
                                    if (!canManage) {
                                        return (
                                            <p className="text-sm text-gray-500 mt-2">
                                                {t("reservations.waitingForSplit", {
                                                    name:
                                                        memberById.get(reservation.created_by)?.name ??
                                                        t("common.none"),
                                                })}
                                            </p>
                                        );
                                    }

                                    if (splitFor !== reservation.id) {
                                        return (
                                            <div className="mt-3">
                                                <button
                                                    onClick={() => {
                                                        setTicked(yesProfileIds(event.id));
                                                        setSplitFor(reservation.id);
                                                    }}
                                                    className="rounded-md px-4 py-2 text-sm font-medium"
                                                    style={{
                                                        backgroundColor: "var(--primary)",
                                                        color: "var(--primary-text)",
                                                    }}
                                                >
                                                    {t("reservations.setSplit")}
                                                </button>
                                            </div>
                                        );
                                    }

                                    return renderSplitPicker(reservation, false);
                                }

                                const hasOtherPaid = rows.some(
                                    (p) => p.paid && p.user_id !== reservation.created_by
                                );
                                // The creator's own row is paid automatically (they
                                // fronted the pitch). Once anyone else has paid, the
                                // shares are real money and can no longer be rewritten.
                                const canEditSplit = isCreatorOrAdmin && !hasOtherPaid;

                                if (splitFor === reservation.id && canEditSplit) {
                                    return renderSplitPicker(reservation, true);
                                }

                                return (
                                    <div className="mt-3">
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                            <span className="font-medium text-gray-600">
                                                {t("reservations.perPerson", { amount: formatAmount(share) })}
                                            </span>
                                            <span className="text-gray-400">
                                                {t("reservations.paidCount", {
                                                    paid: paidRows.length,
                                                    total: rows.length,
                                                })}
                                            </span>
                                            {paidRows.length === rows.length ? (
                                                <span className="text-green-600">
                                                    {t("reservations.allPaid")}
                                                </span>
                                            ) : (
                                                <span className="text-yellow-600">
                                                    {t("reservations.outstanding", {
                                                        amount: formatAmount(total - paidTotal),
                                                    })}
                                                </span>
                                            )}
                                            {reservation.created_by === myProfileId &&
                                                rows
                                                    .filter((p) => p.user_id === myProfileId)
                                                    .map((p) => (
                                                        <span key={p.id} className="text-gray-400">
                                                            {t("reservations.yourShare", {
                                                                amount: formatAmount(Number(p.amount)),
                                                            })}
                                                        </span>
                                                    ))}
                                            {canEditSplit && (
                                                <button
                                                    onClick={() => {
                                                        setTicked(rows.map((p) => p.user_id));
                                                        setSplitFor(reservation.id);
                                                    }}
                                                    className="text-gray-400 underline hover:text-gray-600"
                                                >
                                                    {t("reservations.editSplit")}
                                                </button>
                                            )}
                                        </div>

                                        {isCreatorOrAdmin && !canEditSplit && (
                                            <p className="mt-1 text-xs text-gray-400">
                                                {t("reservations.splitLocked")}
                                            </p>
                                        )}

                                        <div className="mt-2 divide-y divide-gray-100">
                                            {rows.map((payment) => {
                                                const isMine = payment.user_id === myProfileId;
                                                return (
                                                    <div
                                                        key={payment.id}
                                                        className="flex items-center justify-between gap-2 py-1.5"
                                                    >
                                                        <div className="flex min-w-0 items-center gap-2">
                                                            <span
                                                                aria-hidden="true"
                                                                className={payment.paid ? "text-green-600" : "text-gray-300"}
                                                            >
                                                                {payment.paid ? "✓" : "○"}
                                                            </span>
                                                            <span className="truncate text-sm text-gray-700">
                                                                {memberById.get(payment.user_id)?.name ??
                                                                    t("common.none")}
                                                                {isMine && (
                                                                    <span className="text-gray-400">
                                                                        {" "}
                                                                        {t("reservations.you")}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                        <div className="flex shrink-0 items-center gap-3">
                                                            <span className="text-sm text-gray-500">
                                                                {formatAmount(Number(payment.amount))}
                                                            </span>
                                                            {isMine ? (
                                                                <button
                                                                    onClick={() => togglePaid(payment)}
                                                                    disabled={busyId === payment.id}
                                                                    className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                                                        payment.paid
                                                                            ? "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                                                                            : "border-green-300 bg-green-100 text-green-700 hover:bg-green-200"
                                                                    }`}
                                                                >
                                                                    {payment.paid
                                                                        ? t("reservations.markUnpaid")
                                                                        : t("reservations.markPaid")}
                                                                </button>
                                                            ) : (
                                                                <span
                                                                    className={`text-xs ${
                                                                        payment.paid
                                                                            ? "text-green-600"
                                                                            : "text-gray-400"
                                                                    }`}
                                                                >
                                                                    {payment.paid
                                                                        ? t("reservations.paidLabel")
                                                                        : t("reservations.unpaidLabel")}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {paidRows.length === rows.length && isCreatorOrAdmin && (
                                            <div className="mt-3 flex justify-end border-t border-gray-200 pt-3">
                                                <button
                                                    onClick={() => closeReservation(reservation)}
                                                    disabled={busyId === reservation.id}
                                                    className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                                                    style={{
                                                        backgroundColor: "var(--primary)",
                                                        color: "var(--primary-text)",
                                                    }}
                                                >
                                                    {busyId === reservation.id
                                                        ? t("reservations.closing")
                                                        : t("reservations.close")}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()
                        )}
                    </div>
                )}
            </div>
        );
    }

    function renderClosed(event: TrainingEvent) {
        const reservation = reservationByEvent.get(event.id);
        if (!reservation) return null;
        const canManage = reservation.created_by === myProfileId || isAdmin;

        return (
            <div
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-4 py-3 shadow-sm"
            >
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-black">{event.title}</p>
                    <p className="text-xs text-gray-500">
                        <EventDate date={event.date} />
                        {event.location && ` · ${event.location}`}
                        {` · ${formatAmount(Number(reservation.amount))}`}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-gray-400">{t("reservations.closed")}</span>
                    {canManage && (
                        <button
                            onClick={() => reopenReservation(reservation)}
                            disabled={busyId === reservation.id}
                            className="text-xs text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
                        >
                            {busyId === reservation.id
                                ? t("reservations.reopening")
                                : t("reservations.reopen")}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (loading) {
        return <p className="text-gray-500" aria-live="polite">{t("common.loading")}</p>;
    }

    if (!hasTeam) {
        return (
            <div className="max-w-2xl mx-auto">
                <h1 className="text-2xl font-bold text-black mb-6">{t("reservations.title")}</h1>
                <p className="text-gray-500">{t("reservations.noTeam")}</p>
            </div>
        );
    }

    const now = new Date();
    const isClosed = (event: TrainingEvent) =>
        Boolean(reservationByEvent.get(event.id)?.closed_at);
    const upcoming = events.filter((e) => new Date(e.date) >= now && !isClosed(e));
    const past = events
        .filter(
            (e) => new Date(e.date) < now && reservationByEvent.has(e.id) && !isClosed(e)
        )
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const closedEvents = events
        .filter(isClosed)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="max-w-2xl mx-auto">
            <AlertModal
                open={alertOpen}
                title={t("common.error")}
                message={alertMsg}
                onClose={() => setAlertOpen(false)}
            />
            <ConfirmModal
                open={confirmCancel !== null}
                title={t("common.confirm")}
                message={t("reservations.cancelConfirm")}
                danger
                onConfirm={() => {
                    const reservation = confirmCancel;
                    setConfirmCancel(null);
                    if (reservation) cancelReservation(reservation);
                }}
                onCancel={() => setConfirmCancel(null)}
            />
            <h1 className="text-2xl font-bold text-black mb-1">{t("reservations.title")}</h1>
            <p className="text-sm text-gray-500 mb-6">{t("reservations.subtitle")}</p>

            <div className="mb-8">
                <h2 className="text-lg font-bold text-black mb-3">{t("reservations.upcoming")}</h2>
                {upcoming.length > 0 ? (
                    <div className="space-y-3">{upcoming.map(renderTraining)}</div>
                ) : (
                    <p className="text-gray-500">{t("reservations.noUpcoming")}</p>
                )}
            </div>

            {past.length > 0 && (
                <div>
                    <h2 className="text-lg font-bold text-black mb-3">{t("reservations.past")}</h2>
                    <div className="space-y-3">{past.map(renderTraining)}</div>
                </div>
            )}

            {closedEvents.length > 0 && (
                <details className="mt-8">
                    <summary className="cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-700">
                        {t("reservations.closedCount", { count: closedEvents.length })}
                    </summary>
                    <div className="mt-3 space-y-2">{closedEvents.map(renderClosed)}</div>
                </details>
            )}
        </div>
    );
}
