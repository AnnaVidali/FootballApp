/**
 * RSVP deadline for an event. Every event -- match or training -- closes at
 * midnight on its own day.
 *
 * "Midnight" is midnight in the viewer's own timezone, which follows the day
 * boundary the calendar and the event list use. The previous UTC version took
 * midnight on the *UTC* day, so for a kickoff late enough to land on the next
 * local day the deadline fell almost 24 hours early, and for ordinary evening
 * kickoffs it drifted by the DST offset.
 *
 * The browser is the authority: every caller is a client component, so this
 * is evaluated in the viewer's timezone and matches the RSVP button. Keep it
 * that way -- a server render would use the process timezone (UTC on Vercel)
 * and could hide an event that is still open, or keep one around after it
 * closed.
 */
export function getAvailabilityDeadline(event: { date: string }): Date {
    const start = new Date(event.date);
    if (Number.isNaN(start.getTime())) return new Date(0);
    return new Date(start.getFullYear(), start.getMonth(), start.getDate());
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
 * Amount formatted for the viewer's locale, with the currency symbol where
 * that locale puts it ("€7.40" in en-GB, "7,40 €" in es-ES) and always two
 * decimals.
 *
 * `locale` is a BCP-47 tag (see `intlLocale` in lib/i18n) and `currency` an
 * ISO 4217 code; the euro is what the app charges in.
 */
export const DEFAULT_CURRENCY = "EUR";

export function formatAmount(
    value: number,
    locale = "en-GB",
    currency = DEFAULT_CURRENCY
): string {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

/**
 * What each participant owes in a reservation split, rounded to the nearest
 * cent with standard rounding so everyone pays the same amount.
 * Mirrors `finalize_reservation_split` (migration 034).
 *
 * A share can round to 0.00 only when there is less than half a cent per
 * participant (0.04 split 13 ways). That is not clamped on purpose: a 0.01
 * minimum would collect several times the reservation amount. Real pitch
 * prices never get near it.
 */
export function equalShare(total: number, count: number): number {
    if (count <= 0) return 0;
    return Math.round((total * 100) / count) / 100;
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

/** Upload cap for team logos, shared by the create-team form and the settings page. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * A collision-proof storage object name that keeps the original extension.
 *
 * Reusing the uploaded file's own name would write the same object path on
 * every re-upload, so the public URL never changed and browsers kept serving
 * the old cached image. A fresh name per upload sidesteps the cache; the
 * previous object is left behind for the storage lifecycle policy to reap.
 */
export function uniqueStorageName(fileName: string): string {
    const dot = fileName.lastIndexOf(".");
    const extension = dot > 0 ? fileName.slice(dot).toLowerCase() : "";
    return `${randomId()}${extension}`;
}

/**
 * A collision-proof random id, used for storage object names. Prefers
 * `crypto.randomUUID`, falls back to `crypto.getRandomValues`, and only
 * then to a timestamp + `Math.random` for the (non-browser) odd runtime.
 */
export function randomId(): string {
    if (typeof crypto !== "undefined") {
        if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
        if (typeof crypto.getRandomValues === "function") {
            const bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
        }
    }
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

/**
 * Runs `worker` over every item with at most `limit` in flight at once, so a
 * large batch of uploads does not open dozens of sockets at the same time or
 * flood the storage API, while still finishing much sooner than one at a time.
 */
export async function mapWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>
): Promise<void> {
    if (items.length === 0) return;
    let next = 0;
    const runners = Array.from(
        { length: Math.min(Math.max(1, limit), items.length) },
        async () => {
            while (next < items.length) {
                const index = next++;
                await worker(items[index]);
            }
        }
    );
    await Promise.all(runners);
}
