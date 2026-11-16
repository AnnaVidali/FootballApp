import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-errors";

/** A stand-in `t` that returns the key, so the mapping itself is asserted. */
const t = (key: string) => key;

describe("authErrorMessage", () => {
    it("maps the known Supabase codes", () => {
        expect(authErrorMessage({ code: "invalid_credentials" }, t)).toBe("auth.errorInvalidCredentials");
        expect(authErrorMessage({ code: "email_not_confirmed" }, t)).toBe("auth.errorEmailNotConfirmed");
        expect(authErrorMessage({ code: "user_already_exists" }, t)).toBe("auth.errorUserExists");
        expect(authErrorMessage({ code: "email_exists" }, t)).toBe("auth.errorUserExists");
        expect(authErrorMessage({ code: "weak_password" }, t)).toBe("auth.errorWeakPassword");
        expect(authErrorMessage({ code: "same_password" }, t)).toBe("auth.errorSamePassword");
        expect(authErrorMessage({ code: "over_email_send_rate_limit" }, t)).toBe("auth.errorRateLimited");
        expect(authErrorMessage({ code: "over_request_rate_limit" }, t)).toBe("auth.errorRateLimited");
    });

    it("falls back to a generic message for an unknown or missing code", () => {
        expect(authErrorMessage({ code: "something_new" }, t)).toBe("auth.errorGeneric");
        expect(authErrorMessage(undefined, t)).toBe("auth.errorGeneric");
        expect(authErrorMessage(null, t)).toBe("auth.errorGeneric");
    });
});
