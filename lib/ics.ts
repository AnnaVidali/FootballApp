/**
 * A single-event iCalendar document for the "add to calendar" download.
 *
 * Kept pure and separate from the button so the format can be unit-tested.
 * The two things a hand-rolled ICS gets wrong are escaping and folding:
 * a comma or semicolon in a title is a *value separator* in the format, so
 * `SUMMARY:Training, week 1` is read as a malformed property by stricter
 * clients, and a line longer than 75 octets has to be folded. Both are
 * handled here so callers only pass plain text.
 */

/** RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, comma and newlines. */
export function escapeIcsText(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line at 75 octets, continuing with CRLF + a single space,
 * as RFC 5545 §3.1 requires. Counted in UTF-8 octets rather than characters
 * so a multi-byte character is never split across the fold.
 */
function foldIcsLine(line: string): string {
    const encoder = new TextEncoder();
    const chunks: string[] = [];
    let current = "";
    let bytes = 0;
    for (const char of line) {
        const size = encoder.encode(char).length;
        // 74 leaves room for the leading space on the continuation line.
        if (bytes + size > 74) {
            chunks.push(current);
            current = "";
            bytes = 0;
        }
        current += char;
        bytes += size;
    }
    chunks.push(current);
    return chunks.join("\r\n ");
}

/** An instant as the compact UTC form `YYYYMMDDTHHMMSSZ` the format uses. */
export function toIcsDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcs({
    uid,
    title,
    start,
    end,
    location,
    stamp = new Date(),
}: {
    uid: string;
    title: string;
    start: Date;
    end: Date;
    location?: string | null;
    stamp?: Date;
}): string {
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Squad HQ//Squad HQ//EN",
        "BEGIN:VEVENT",
        // RFC 5545 §3.6.1: UID and DTSTAMP are mandatory on every VEVENT.
        // `stamp` is injectable so the output can be asserted in tests.
        `UID:${uid}`,
        `DTSTAMP:${toIcsDate(stamp)}`,
        `DTSTART:${toIcsDate(start)}`,
        `DTEND:${toIcsDate(end)}`,
        foldIcsLine(`SUMMARY:${escapeIcsText(title)}`),
        location ? foldIcsLine(`LOCATION:${escapeIcsText(location)}`) : "",
        "END:VEVENT",
        "END:VCALENDAR",
    ].filter(Boolean);

    return lines.join("\r\n");
}
