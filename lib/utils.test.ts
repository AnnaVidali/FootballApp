import { describe, expect, it } from "vitest";
import {
    equalShare,
    formatAmount,
    fromDateTimeLocalValue,
    getAvailabilityDeadline,
    toDateTimeLocalValue,
} from "./utils";

describe("equalShare", () => {
    it("splits evenly when the total divides by the count", () => {
        expect(equalShare(30, 6)).toBe(5);
        expect(equalShare(10, 4)).toBe(2.5);
    });

    it("rounds to the nearest cent, like migration 034", () => {
        // 30.50 / 13 = 2.346... -> 2.35, so 13 × 2.35 = 30.55 (5c over).
        expect(equalShare(30.5, 13)).toBe(2.35);
        // 30.50 / 6 = 5.083... -> 5.08, so 6 × 5.08 = 30.48 (2c short).
        expect(equalShare(30.5, 6)).toBe(5.08);
    });

    it("can round to zero only below half a cent per person", () => {
        expect(equalShare(0.04, 13)).toBe(0);
        expect(equalShare(0.01, 2)).toBe(0.01);
    });

    it("returns zero for no participants", () => {
        expect(equalShare(30, 0)).toBe(0);
        expect(equalShare(30, -1)).toBe(0);
    });
});

describe("getAvailabilityDeadline", () => {
    it("returns local midnight on the event's day", () => {
        const deadline = getAvailabilityDeadline({ date: "2026-03-14T20:00:00.000Z" });
        expect(deadline.getFullYear()).toBe(2026);
        expect(deadline.getMonth()).toBe(2);
        expect(deadline.getDate()).toBe(14);
        expect(deadline.getHours()).toBe(0);
        expect(deadline.getMinutes()).toBe(0);
        expect(deadline.getSeconds()).toBe(0);
    });

    it("returns the epoch for an invalid date", () => {
        expect(getAvailabilityDeadline({ date: "not-a-date" }).getTime()).toBe(0);
    });
});

describe("formatAmount", () => {
    it("uses two decimals and a comma", () => {
        expect(formatAmount(7.4)).toBe("€7,40");
        expect(formatAmount(30.5)).toBe("€30,50");
        expect(formatAmount(0)).toBe("€0,00");
    });

    it("accepts another currency symbol", () => {
        expect(formatAmount(2, "$")).toBe("$2,00");
    });
});

describe("toDateTimeLocalValue", () => {
    it("formats an ISO timestamp as a local datetime-local value", () => {
        const date = new Date(2026, 2, 14, 20, 5);
        expect(toDateTimeLocalValue(date.toISOString())).toBe("2026-03-14T20:05");
    });

    it("returns an empty string for an invalid date", () => {
        expect(toDateTimeLocalValue("nope")).toBe("");
    });
});

describe("fromDateTimeLocalValue", () => {
    it("parses a local datetime-local value as an ISO timestamp", () => {
        const expected = new Date(2026, 2, 14, 20, 5).toISOString();
        expect(fromDateTimeLocalValue("2026-03-14T20:05")).toBe(expected);
    });

    it("returns null for an empty or invalid value", () => {
        expect(fromDateTimeLocalValue("")).toBeNull();
        expect(fromDateTimeLocalValue("not-a-date")).toBeNull();
    });
});
