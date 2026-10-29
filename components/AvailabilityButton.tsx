"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeLeft, getAvailabilityDeadline } from "@/lib/utils";
import AlertModal from "@/components/AlertModal";
import { useLocaleContext } from "@/lib/i18n-context";
import { useNow } from "@/lib/use-now";

type Status = "available" | "maybe" | "unavailable";

const statusKeys: Record<Status, string> = {
    available: "common.yes",
    maybe: "common.maybe",
    unavailable: "common.no",
};

const statusStyles: Record<Status, { activeBg: string; inactiveBg: string }> = {
    available: { activeBg: "bg-green-100 text-green-700 border-green-300", inactiveBg: "bg-white text-gray-500 border-gray-200 hover:border-green-300" },
    maybe: { activeBg: "bg-yellow-100 text-yellow-700 border-yellow-300", inactiveBg: "bg-white text-gray-500 border-gray-200 hover:border-yellow-300" },
    unavailable: { activeBg: "bg-red-100 text-red-700 border-red-300", inactiveBg: "bg-white text-gray-500 border-gray-200 hover:border-red-300" },
};

const supabase = createClient();

/**
 * Whether the RSVP deadline has already passed.
 *
 * Kept outside the component on purpose: reading the wall clock while
 * rendering is not allowed, and this check has to happen against the real
 * clock at the moment the player clicks, not against the value the last
 * render happened to compute.
 */
function isPastDeadline(deadline: Date): boolean {
    return deadline.getTime() - Date.now() <= 0;
}

export default function AvailabilityButton({
    eventId,
    eventDate,
    currentUserId,
    initialStatus,
    onUpdate,
}: {
    eventId: string;
    eventDate: string;
    currentUserId: string;
    initialStatus: Status | null;
    onUpdate: (eventId: string, userId: string, status: Status) => void;
}) {
    const [selected, setSelected] = useState<Status | null>(initialStatus);
    const [loading, setLoading] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertMsg, setAlertMsg] = useState("");
    const { t } = useLocaleContext();

    // Adjust the selected status when the parent hands down a new value.
    // Doing this during render (instead of in an effect) avoids the extra
    // render pass and the cascading-render lint error.
    const [prevInitialStatus, setPrevInitialStatus] = useState(initialStatus);
    if (prevInitialStatus !== initialStatus) {
        setPrevInitialStatus(initialStatus);
        setSelected(initialStatus);
    }

    // Derived, not stored: the deadline has to follow the event when the admin
    // moves it, otherwise the countdown keeps pointing at the old date.
    const deadline = useMemo(
        () => getAvailabilityDeadline({ date: eventDate }),
        [eventDate]
    );

    const now = useNow();
    const timeLeft = now === null ? null : deadline.getTime() - now;
    const closed = timeLeft !== null && timeLeft <= 0;

    async function respond(status: Status) {
        // Check against the wall clock at click time rather than the
        // render-time value, so a click that lands in the first moments
        // after hydration still respects the deadline.
        if (isPastDeadline(deadline)) return;
        setLoading(true);
        try {
            const { error } = await supabase.from("availability").upsert(
                { user_id: currentUserId, event_id: eventId, status },
                { onConflict: "user_id,event_id" }
            );
            if (error) throw new Error(error.message);
            setSelected(status);
            onUpdate(eventId, currentUserId, status);
        } catch (e) {
            setAlertMsg(t("availability.saveFailed", { error: (e as Error).message }));
            setAlertOpen(true);
        } finally {
            setLoading(false);
        }
    }

    if (closed) {
        return <p className="text-xs text-gray-400 mt-2">{t("availability.closed")}</p>;
    }

    return (
        <div>
            <AlertModal open={alertOpen} title={t("common.error")} message={alertMsg} onClose={() => setAlertOpen(false)} />
            <div className="flex gap-2 mt-2">
                {(["available", "maybe", "unavailable"] as Status[]).map((status) => {
                    const isActive = selected === status;
                    return (
                        <button
                            key={status}
                            type="button"
                            onClick={() => respond(status)}
                            disabled={loading}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                isActive ? statusStyles[status].activeBg : statusStyles[status].inactiveBg
                            }`}
                        >
                            {t(statusKeys[status])}
                        </button>
                    );
                })}
            </div>
            <p className="text-xs text-gray-400 mt-1">
                {timeLeft === null ? "" : t("availability.closesIn", { time: formatTimeLeft(timeLeft) ?? "" })}
            </p>
        </div>
    );
}
