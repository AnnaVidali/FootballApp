import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";

const NONCE = "abc123";
const SUPABASE = "https://project.supabase.co";

function build(overrides: Partial<Parameters<typeof buildCsp>[0]> = {}) {
    return buildCsp({
        nonce: NONCE,
        isDev: false,
        supabaseUrl: SUPABASE,
        ...overrides,
    });
}

describe("buildCsp", () => {
    it("allows the nonce and only same-origin scripts", () => {
        const csp = build();
        expect(csp).toContain(`script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`);
        expect(csp).not.toContain("'unsafe-inline'; script");
    });

    it("allows eval only in development", () => {
        expect(build()).not.toContain("'unsafe-eval'");
        expect(build({ isDev: true })).toContain("'unsafe-eval'");
    });

    it("allows the Supabase origins for API calls and storage images", () => {
        const csp = build();
        expect(csp).toContain(`img-src 'self' data: blob: ${SUPABASE}`);
        expect(csp).toContain(`connect-src 'self' ${SUPABASE} wss://project.supabase.co`);
    });

    it("allows websockets only in development", () => {
        expect(build()).not.toContain("ws:");
        expect(build({ isDev: true })).toContain("connect-src 'self' " + SUPABASE + " wss://project.supabase.co ws: wss:");
    });

    it("keeps inline styles for React style props", () => {
        expect(build()).toContain("style-src 'self' 'unsafe-inline'");
    });

    it("locks down objects, framing, forms and the base URI", () => {
        const csp = build();
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("form-action 'self'");
        expect(csp).toContain("base-uri 'self'");
    });

    it("upgrades insecure requests only in production", () => {
        expect(build()).toContain("upgrade-insecure-requests");
        expect(build({ isDev: true })).not.toContain("upgrade-insecure-requests");
    });

    it("still builds a policy when the Supabase URL is missing", () => {
        const csp = build({ supabaseUrl: "" });
        expect(csp).toContain("default-src 'self'");
        expect(csp).not.toContain("wss://");
    });
});
