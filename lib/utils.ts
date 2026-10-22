/**
 * RSVP deadline for an event. Matches close at midnight on the match day;
 * trainings close 25 hours before their start time.
 *
 * The deadline is computed in UTC so the server and the browser always agree.
 * `setHours()` used the *runtime's* local timezone, which meant the cutoff
 * depended on whichever device the player happened to be using (and the
 * server-rendered list could disagree with the button next to it).
 */
export function getAvailabilityDeadline(event: { date: string; type: string }): Date {
    const start = new Date(event.date);
    if (Number.isNaN(start.getTime())) return new Date(0);
    return event.type === "match"
        ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
        : new Date(start.getTime() - 25 * 60 * 60 * 1000);
}

/**
 * An ISO timestamp as the `YYYY-MM-DDTHH:mm` string a `datetime-local`
 * input expects, in the viewer's own timezone.
 *
 * A `datetime-local` field carries no timezone: the browser shows the
 * value verbatim and reads it back as local time. Slicing the raw ISO
 * string therefore drops the UTC wall clock into the field, so the admin
 * sees a different time than the event list shows, and saving without
 * touching the field moves the event by the timezone offset.
 */
export function toDateTimeLocalValue(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
}

/**
 * The inverse of `toDateTimeLocalValue`: the local wall clock of a
 * `datetime-local` field as an ISO timestamp. Returns null when the
 * field is empty or does not hold a date.
 */
export function fromDateTimeLocalValue(value: string): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

/**
 * Amount with 2 decimals and comma as the decimal separator (7,40 / 8,00).
 * Currency symbol defaults to the euro, which is what the app charges in;
 * pass a different one if that ever changes.
 */
export const DEFAULT_CURRENCY = "€";

export function formatAmount(value: number, currency = DEFAULT_CURRENCY): string {
    return `${currency}${value.toFixed(2).replace(".", ",")}`;
}

export function formatTimeLeft(ms: number): string | null {
    if (ms <= 0) return null;
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
}
