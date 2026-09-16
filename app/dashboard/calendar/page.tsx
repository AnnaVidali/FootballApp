"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";

const supabase = createClient();

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

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function CalendarPage() {
  const { t, locale } = useLocaleContext();
  const dateFmt = locale === "es" ? "es-ES" : "en-GB";

  const [events, setEvents] = useState<Event[]>([]);
  const [myStatus, setMyStatus] = useState<Record<string, RsvpStatus>>({});
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [hideDeclined, setHideDeclined] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("user_id", user.id)
        .single();
      if (!profile?.team_id) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("events")
        .select("id, title, type, date")
        .eq("team_id", profile.team_id)
        .order("date", { ascending: true });
      const rows = data ?? [];
      setEvents(rows);
      if (rows.length > 0) {
        const ids = rows.map((e) => e.id);
        const { data: avail } = await supabase
          .from("availability")
          .select("event_id, status")
          .eq("user_id", user.id)
          .in("event_id", ids);
        const map: Record<string, RsvpStatus> = {};
        (avail ?? []).forEach((a) => {
          map[a.event_id] = a.status as RsvpStatus;
        });
        setMyStatus(map);
      }
      setLoading(false);
    }
    load();
  }, []);

  function getDeadline(event: { date: string; type: string }) {
    return event.type === "match"
      ? new Date(new Date(event.date).setHours(0, 0, 0, 0))
      : new Date(new Date(event.date).getTime() - 25 * 60 * 60 * 1000);
  }

  const visibleEvents = useMemo(() => {
    const now = new Date();
    const map: Record<string, DayEvent[]> = {};
    events.forEach((e) => {
      const status = myStatus[e.id] ?? null;
      const declinedAfterDeadline =
        status !== "available" && now > getDeadline(e);
      if (hideDeclined && declinedAfterDeadline) return;
      const dimmed =
        declinedAfterDeadline || now.getTime() > new Date(e.date).getTime();
      const key = dayKey(new Date(e.date));
      (map[key] ??= []).push({ event: e, status, dimmed });
    });
    return map;
  }, [events, myStatus, hideDeclined]);

  const cellDates = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from(
      { length: 42 },
      (_, i) =>
        new Date(viewYear, viewMonth, 1 - offset + i)
    );
  }, [viewYear, viewMonth]);

  const todayKey = useMemo(() => dayKey(new Date()), []);

  const weekdayLabels = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) =>
      new Date(2026, 0, 5 + i).toLocaleDateString(dateFmt, {
        weekday: "short",
      })
    );
  }, [dateFmt]);

  const monthTitle = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    dateFmt,
    { month: "long", year: "numeric" }
  );

  function goToToday() {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  }

  if (loading) {
    return (
      <p className="text-gray-500" aria-live="polite">
        {t("common.loading")}
      </p>
    );
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
            onClick={() => setViewMonth(viewMonth - 1)}
            aria-label={t("calendar.prevMonth")}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            &#8592;
          </button>
          <button
            onClick={() => setViewMonth(viewMonth + 1)}
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
            const key = dayKey(cell);
            const isToday = key === todayKey;
            const inMonth = cell.getMonth() === viewMonth;
            const dayEvents = visibleEvents[key] ?? [];
            return (
              <div
                key={key}
                className={`min-h-28 border-b border-r border-gray-100 p-1.5 ${
                  inMonth ? "bg-white" : "bg-gray-50"
                }`}
              >
                <div className="mb-1 flex justify-end">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      isToday
                        ? "bg-[var(--primary)] font-semibold text-[var(--primary-text)]"
                        : inMonth
                        ? "text-gray-700"
                        : "text-gray-400"
                    }`}
                  >
                    {cell.getDate()}
                  </span>
                </div>
                <div className="space-y-1">
                  {dayEvents.map(({ event, status, dimmed }) => (
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
                        {new Date(event.date).toLocaleTimeString(dateFmt, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
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