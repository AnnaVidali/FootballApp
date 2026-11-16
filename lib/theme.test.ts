import { describe, expect, it } from "vitest";
import { themeVars } from "./theme";

describe("themeVars", () => {
    it("keeps a valid colour and derives readable text and display values", () => {
        // The app's default green: dark enough to stay itself on white, but
        // saturated and bright enough to need black label text.
        expect(themeVars("#16a34a")).toEqual({
            primary: "#16a34a",
            primaryText: "#000000",
            primaryDisplay: "#16a34a",
        });
    });

    it("falls back to the default green for anything that is not a hex colour", () => {
        const fallback = themeVars("#16a34a");
        expect(themeVars("red")).toEqual(fallback);
        expect(themeVars("#abc")).toEqual(fallback);
        expect(themeVars("")).toEqual(fallback);
        // A value that could break out of the <style> tag it is rendered into.
        expect(themeVars("#fff;}body{display:none")).toEqual(fallback);
    });

    it("uses white text on a dark colour", () => {
        expect(themeVars("#000000").primaryText).toBe("#ffffff");
        expect(themeVars("#1e3a8a").primaryText).toBe("#ffffff");
    });

    it("darkens a very light colour for use on white backgrounds", () => {
        expect(themeVars("#ffffff").primaryDisplay).toBe("#999999");
        // 60% of #ffcc00, rounded per channel.
        expect(themeVars("#ffcc00").primaryDisplay).toBe("#997a00");
    });
});
