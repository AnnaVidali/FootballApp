/**
 * RSVP deadline for an event. Matches close at midnight on the match day;
 * trainings close 25 hours before their start time.
 */
export function getAvailabilityDeadline(event: { date: string; type: string }): Date {
    return event.type === "match"
        ? new Date(new Date(event.date).setHours(0, 0, 0, 0))
        : new Date(new Date(event.date).getTime() - 25 * 60 * 60 * 1000);
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
