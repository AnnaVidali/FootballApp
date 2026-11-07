import { describe, expect, it } from "vitest";
import { isOwnTeamLogoUrl } from "./logo-url";

const SUPABASE = "https://project.supabase.co";
const TEAM = "fc537a5f-f222-49ac-a085-b18368759d06";
const OWN_LOGO = `${SUPABASE}/storage/v1/object/public/team-logos/${TEAM}/logo.png`;

describe("isOwnTeamLogoUrl", () => {
    it("accepts the team's own logo object", () => {
        expect(isOwnTeamLogoUrl(OWN_LOGO, TEAM, SUPABASE)).toBe(true);
    });

    it("accepts a supabase URL with a trailing slash or path", () => {
        expect(isOwnTeamLogoUrl(OWN_LOGO, TEAM, `${SUPABASE}/`)).toBe(true);
    });

    it("rejects http, even on the same host", () => {
        expect(isOwnTeamLogoUrl(OWN_LOGO.replace("https:", "http:"), TEAM, SUPABASE)).toBe(false);
    });

    it("rejects another origin", () => {
        expect(
            isOwnTeamLogoUrl(OWN_LOGO.replace(SUPABASE, "https://evil.example"), TEAM, SUPABASE),
        ).toBe(false);
    });

    it("rejects a different bucket on the same origin", () => {
        expect(
            isOwnTeamLogoUrl(
                OWN_LOGO.replace("/team-logos/", "/gallery/"),
                TEAM,
                SUPABASE,
            ),
        ).toBe(false);
    });

    it("rejects another team's folder", () => {
        expect(
            isOwnTeamLogoUrl(
                OWN_LOGO.replace(TEAM, "00000000-0000-0000-0000-000000000000"),
                TEAM,
                SUPABASE,
            ),
        ).toBe(false);
    });

    it("rejects paths that only contain the folder name", () => {
        // The URL parser normalises `..`, so this escapes into `team-logos/other`.
        expect(
            isOwnTeamLogoUrl(
                `${SUPABASE}/storage/v1/object/public/team-logos/${TEAM}/../other/logo.png`,
                TEAM,
                SUPABASE,
            ),
        ).toBe(false);
        expect(
            isOwnTeamLogoUrl(
                `${SUPABASE}/storage/v1/object/public/team-logos/not-${TEAM}/logo.png`,
                TEAM,
                SUPABASE,
            ),
        ).toBe(false);
    });

    it("rejects data and file URLs", () => {
        expect(isOwnTeamLogoUrl("data:image/png;base64,AAAA", TEAM, SUPABASE)).toBe(false);
        expect(isOwnTeamLogoUrl("file:///etc/passwd", TEAM, SUPABASE)).toBe(false);
    });

    it("rejects invalid URLs on either side", () => {
        expect(isOwnTeamLogoUrl("not a url", TEAM, SUPABASE)).toBe(false);
        expect(isOwnTeamLogoUrl(OWN_LOGO, TEAM, "not a url")).toBe(false);
    });
});
