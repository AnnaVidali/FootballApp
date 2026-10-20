/**
 * RSVP deadline for an event. Matches close at midnight on the match day;
 * trainings close 25 hours before their start time.
 */
export function getAvailabilityDeadline(event: { date: string; type: string }): Date {
    return event.type === "match"
        ? new Date(new Date(event.date).setHours(0, 0, 0, 0))
        : new Date(new Date(event.date).getTime() - 25 * 60 * 60 * 1000);
}

/** Euro amount with up to 2 decimals, comma as separator (€7,40 / €8,00). */
export function formatAmount(value: number): string {
    return `€${value.toFixed(2).replace(".", ",")}`;
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
