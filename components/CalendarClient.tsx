"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useLocaleContext } from "@/lib/i18n-context";
import { intlLocale } from "@/lib/i18n";
import { getAvailabilityDeadline } from "@/lib/utils";
import { useNow } from "@/lib/use-now";

type Event = {
  id: string;
  title: string;
  type: "match" | "training";
  date: string;
};

type RsvpStatus = "available" | "maybe" | "unavailable";

type DayEvent = {
  event: Event;
  status: RsvpStatus | null;
  dimmed: boolean;
};

const TYPE_COLORS: Record<Event["type"], string> = {
  match: "#2563eb",
  training: "#16a34a",
};

const RSVP_COLORS: Record<RsvpStatus, string> = {
  available: "#16a34a",
  maybe: "#f59e0b",
  unavailable: "#ef4444",
};
const RSVP_PENDING = "#d1d5db";

/**
 * A grid key from UTC parts on the server and the first client render, and
 * from the viewer's local parts once the clock is known. Using one convention
 * at a time keeps the markup identical through hydration.
 */
function dayKey(d: Date, local: boolean): string {
  const year = local ? d.getFullYear() : d.getUTCFullYear();
  const month = local ? d.getMonth() : d.getUTCMonth();
  const day = local ? d.getDate() : d.getUTCDate();
  return `${year}-${month}-${day}`;
}

export default function CalendarClient({
  initialEvents,
  initialStatus,
  serverNow,
}: {
  initialEvents: Event[];
  initialStatus: Record<string, RsvpStatus>;
  serverNow: string;
}) {
  const { t, locale } = useLocaleContext();
  const dateFmt = intlLocale(locale);

  const [events] = useState<Event[]>(initialEvents);
  const [myStatus] = useState<Record<string, RsvpStatus>>(initialStatus);
  const [hideDeclined, setHideDeclined] = useState(false);
  const [viewOverride, setViewOverride] = useState<{ year: number; month: number } | null>(null);
  const now = useNow(60_000);
  const referenceMs = now ?? Date.parse(serverNow);

  // The first paint shows the UTC month of the server's timestamp, which is
  // identical in the HTML and in React's client tree. The clock effect then
  // swaps in the local month; only a viewer right on a month boundary sees a
  // change, and there is no hydration error either way.
  const anchor = viewOverride ?? (() => {
    const d = new Date(referenceMs);
    return now === null
      ? { year: d.getUTCFullYear(), month: d.getUTCMonth() }
      : { year: d.getFullYear(), month: d.getMonth() };
  })();
  const viewYear = anchor.year;
  const viewMonth = anchor.month;

  const visibleEvents = useMemo(() => {
    const map: Record<string, DayEvent[]> = {};
    events.forEach((e) => {
      const status = myStatus[e.id] ?? null;
      // An event that has already started is past its midnight deadline in
      // any timezone, so this absolute comparison is safe on the server.
      const started = referenceMs > new Date(e.date).getTime();
      // The deadline itself is midnight in the viewer's timezone: use the
      // clock once it exists, and the start-time stand-in until then.
      const declinedAfterDeadline =
        status !== "available" &&
        (now !== null ? now > getAvailabilityDeadline(e).getTime() : started);
      if (hideDeclined && declinedAfterDeadline) return;
      const dimmed = declinedAfterDeadline || started;
      const key = dayKey(new Date(e.date), now !== null);
      (map[key] ??= []).push({ event: e, status, dimmed });
    });
    return map;
  }, [events, myStatus, hideDeclined, now, referenceMs]);

  // Grid cells are plain calendar parts, built in UTC. Their keys therefore
  // match the UTC event keys on the server and the local ones in the browser,
  // without ever constructing a Date in the viewer's timezone during render.
  const cellDates = useMemo(() => {
    const offset = (new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(Date.UTC(viewYear, viewMonth, 1 - offset + i));
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const day = d.getUTCDate();
      return {
        key: `${year}-${month}-${day}`,
        day,
        inMonth: month === viewMonth,
      };
    });
  }, [viewYear, viewMonth]);

  const todayKey = useMemo(() => (now === null ? null : dayKey(new Date(now), true)), [now]);

  const weekdayLabels = useMemo(() => {
    // 1 Jan 2024 is a Monday, and the grid starts its week on Monday, so the
    // labels line up with the columns. A fixed anchor keeps them stable.
    return Array.from({ length: 7 }, (_, i) =>
      new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(dateFmt, {
        weekday: "short",
        timeZone: "UTC",
      })
    );
  }, [dateFmt]);

  const monthTitle = new Date(Date.UTC(viewYear, viewMonth, 1)).toLocaleDateString(
    dateFmt,
    { month: "long", year: "numeric", timeZone: "UTC" }
  );

  function moveMonth(delta: number) {
    const total = viewYear * 12 + viewMonth + delta;
    setViewOverride({
      year: Math.floor(total / 12),
      month: ((total % 12) + 12) % 12,
    });
  }

  function goToToday() {
    const d = new Date();
    setViewOverride({ year: d.getFullYear(), month: d.getMonth() });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-black">{t("calendar.title")}</h1>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideDeclined}
            onChange={(e) => setHideDeclined(e.target.checked)}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          {t("calendar.hideDeclined")}
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => moveMonth(-1)}
            aria-label={t("calendar.prevMonth")}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            &#8592;
          </button>
          <button
            onClick={() => moveMonth(1)}
            aria-label={t("calendar.nextMonth")}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            &#8594;
          </button>
          <button
            onClick={goToToday}
            className="rounded-md px-3 py-1.5 text-sm font-medium"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-text)",
            }}
          >
            {t("calendar.today")}
          </button>
        </div>
        <p className="text-lg font-semibold text-black capitalize">
          {monthTitle}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <div className="grid min-w-[56rem] grid-cols-7">
          <div className="contents">
            {weekdayLabels.map((label, i) => (
              <div
                key={i}
                className="border-b border-gray-200 px-1 py-2 text-center text-xs font-medium text-gray-500"
              >
                {label}
              </div>
            ))}
          </div>
          {cellDates.map((cell) => {
            const isToday = cell.key === todayKey;
            return (
              <div
                key={cell.key}
                className={`min-h-28 border-b border-r border-gray-100 p-1.5 ${
                  cell.inMonth ? "bg-white" : "bg-gray-50"
                }`}
              >
                <div className="mb-1 flex justify-end">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      isToday
                        ? "bg-[var(--primary)] font-semibold text-[var(--primary-text)]"
                        : cell.inMonth
                        ? "text-gray-700"
                        : "text-gray-400"
                    }`}
                  >
                    {cell.day}
                  </span>
                </div>
                <div className="space-y-1">
                  {(visibleEvents[cell.key] ?? []).map(({ event, status, dimmed }) => (
                    <Link
                      key={event.id}
                      href={`/dashboard/events?eventId=${event.id}`}
                      className={`flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs leading-tight text-gray-700 hover:border-gray-400 hover:shadow-sm ${
                        dimmed ? "opacity-40" : ""
                      }`}
                      style={{ borderLeft: `3px solid ${TYPE_COLORS[event.type]}` }}
                    >
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: status
                            ? RSVP_COLORS[status]
                            : RSVP_PENDING,
                        }}
                      />
                      <span className="shrink-0 text-gray-500 tabular-nums">
                        {new Date(event.date).toLocaleTimeString(dateFmt,
                          now === null
                            ? { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }
                            : { hour: "2-digit", minute: "2-digit" }
                        )}
                      </span>
                      <span className="min-w-0 truncate">
                        {event.title}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
        <span className="font-medium text-gray-500">{t("calendar.legend")}</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-1 rounded-full" style={{ backgroundColor: TYPE_COLORS.match }} />
          {t("events.match")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-1 rounded-full" style={{ backgroundColor: TYPE_COLORS.training }} />
          {t("events.training")}
        </span>
        <span className="ml-2 font-medium text-gray-500">{t("calendar.yourRsvp")}</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RSVP_COLORS.available }} />
          {t("common.yes")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RSVP_COLORS.maybe }} />
          {t("common.maybe")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RSVP_COLORS.unavailable }} />
          {t("common.no")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RSVP_PENDING }} />
          {t("calendar.pending")}
        </span>
      </div>
    </div>
  );
}
