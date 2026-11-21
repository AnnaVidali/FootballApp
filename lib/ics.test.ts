import { describe, expect, it } from "vitest";
import { buildIcs, escapeIcsText, toIcsDate } from "./ics";

const START = new Date("2026-06-15T18:30:00.000Z");
const END = new Date("2026-06-15T20:30:00.000Z");
const STAMP = new Date("2026-06-01T09:00:00.000Z");
const UID = "event-123@squadhq";

describe("escapeIcsText", () => {
    it("escapes the characters that separate ICS values", () => {
        expect(escapeIcsText("Training, week 1; pitch A")).toBe(
            "Training\\, week 1\\; pitch A"
        );
    });

    it("escapes backslashes and newlines", () => {
        expect(escapeIcsText("a\\b\nc")).toBe("a\\\\b\\nc");
    });
});

describe("toIcsDate", () => {
    it("formats an instant as the compact UTC form", () => {
        expect(toIcsDate(START)).toBe("20260615T183000Z");
    });
});

describe("buildIcs", () => {
    it("produces a well-formed single-event document with CRLF endings", () => {
        const ics = buildIcs({
            uid: UID,
            title: "Match",
            start: START,
            end: END,
            location: "Pitch 1",
            stamp: STAMP,
        });
        expect(ics).toContain("BEGIN:VCALENDAR");
        expect(ics).toContain("PRODID:-//Squad HQ//Squad HQ//EN");
        expect(ics).toContain("BEGIN:VEVENT");
        expect(ics).toContain(`UID:${UID}`);
        expect(ics).toContain("DTSTAMP:20260601T090000Z");
        expect(ics).toContain("DTSTART:20260615T183000Z");
        expect(ics).toContain("DTEND:20260615T203000Z");
        expect(ics).toContain("SUMMARY:Match");
        expect(ics).toContain("LOCATION:Pitch 1");
        expect(ics).toContain("END:VEVENT");
        expect(ics).toContain("END:VCALENDAR");
        // Every line break is CRLF; a bare LF would be a malformed line.
        expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    });

    it("includes the mandatory UID and DTSTAMP even without a location", () => {
        const ics = buildIcs({ uid: UID, title: "Match", start: START, end: END, stamp: STAMP });
        expect(ics).toContain(`UID:${UID}`);
        expect(ics).toContain("DTSTAMP:20260601T090000Z");
    });

    it("escapes a title that contains ICS separators", () => {
        const ics = buildIcs({ uid: UID, title: "Training, week 1", start: START, end: END });
        expect(ics).toContain("SUMMARY:Training\\, week 1");
    });

    it("omits the location line when there is no location", () => {
        expect(buildIcs({ uid: UID, title: "Match", start: START, end: END })).not.toContain(
            "LOCATION:"
        );
        expect(
            buildIcs({ uid: UID, title: "Match", start: START, end: END, location: null })
        ).not.toContain("LOCATION:");
    });

    it("folds a long line at 75 octets and unfolds back to the original", () => {
        const title = "x".repeat(120);
        const ics = buildIcs({ uid: UID, title, start: START, end: END });

        for (const line of ics.split("\r\n")) {
            expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
        }
        // Dropping the CRLF and the single leading space rejoins the property.
        expect(ics.replace(/\r\n /g, "")).toContain(`SUMMARY:${title}`);
    });

    it("never splits a multi-byte character across a fold", () => {
        // Two UTF-8 bytes each, so a character-count fold would break one.
        const title = "\u00a1".repeat(60);
        const ics = buildIcs({ uid: UID, title, start: START, end: END });

        for (const line of ics.split("\r\n")) {
            expect(line).not.toContain("\uFFFD");
        }
        expect(ics.replace(/\r\n /g, "")).toContain(`SUMMARY:${title}`);
    });
});
