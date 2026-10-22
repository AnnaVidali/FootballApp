"use client";

import Link from "next/link";
import AddToCalendarButton from "@/components/AddToCalendarButton";
import AvailabilityStatus from "@/components/AvailabilityStatus";
import EventDate from "@/components/EventDate";
import { useLocaleContext } from "@/lib/i18n-context";
import { useNow } from "@/lib/use-now";
import { formatAmount, getAvailabilityDeadline } from "@/lib/utils";

export type DashboardEvent = {
  id: string;
  title: string;
  type: string;
  date: string;
  location: string | null;
};

/**
 * The upcoming-events list on the dashboard.
 *
 * The RSVP deadline is midnight in the viewer's timezone, so whether an event
 * is worth showing after it closes can only be decided in the browser. Doing
 * it on the server used the process timezone (UTC on Vercel), which for a
 * kickoff just after local midnight hid the event almost a day early.
 *
 * `useNow` is `null` for the server render and the first client render, so the
 * markup matches and nothing is hidden until the clock is known; the
 * unauthenticated dashboard render is permissive rather than wrong.
 */
export default function DashboardEventList({
  events,
  statuses,
  reservationAmounts,
  isCoach,
}: {
  events: DashboardEvent[];
  statuses: Record<string, string>;
  reservationAmounts: Record<string, number>;
  isCoach: boolean;
}) {
  const { t } = useLocaleContext();
  const now = useNow(60_000);

  const visibleEvents = events.filter((event) => {
    if (isCoach || now === null) return true;
    if (now <= getAvailabilityDeadline(event).getTime()) return true;
    // Closed: only keep it for players who confirmed they are coming.
    return statuses[event.id] === "available";
  });

  return visibleEvents.length > 0 ? (
    <div className="space-y-3">
      {visibleEvents.map((event) => {
        const deadline = getAvailabilityDeadline(event);
        const closed = now !== null && now > deadline.getTime();
        const status = statuses[event.id];
        const amount = reservationAmounts[event.id];

        return (
          <div key={event.id} className="rounded-lg bg-white p-4 shadow-sm">
            <div>
              <p className="font-medium text-black">{event.title}</p>
              <p className="text-sm text-gray-500">
                {event.type === "match" ? t("dashboard.match") : t("dashboard.training")} ·{" "}
                <EventDate date={event.date} />
                {event.location && ` · ${event.location}`}
              </p>
              {amount !== undefined && (
                <p className="mt-0.5">
                  <Link
                    href="/dashboard/reservations"
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    🏟️ {t("reservations.pitchReserved", { amount: formatAmount(amount) })}
                  </Link>
                </p>
              )}
              {!isCoach && !closed && status === "maybe" && (
                <p className="text-xs text-yellow-600 mt-1">
                  {t("dashboard.maybeAnswer")}
                </p>
              )}
              {!isCoach && !closed && !status && (
                <p className="text-xs text-gray-400 mt-1">
                  {t("dashboard.markAvailability")}
                </p>
              )}
              {!isCoach && <AvailabilityStatus eventDate={event.date} eventType={event.type} />}
              <div className="mt-2">
                <AddToCalendarButton
                  title={event.title}
                  date={event.date}
                  location={event.location}
                  type={event.type}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <p className="text-gray-500">{t("dashboard.noUpcomingEvents")}</p>
  );
}
