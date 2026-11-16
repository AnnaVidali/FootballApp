import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./api-errors";

/** A stand-in `t` that returns the key, so the mapping itself is asserted. */
const t = (key: string) => key;

describe("apiErrorMessage", () => {
    it("maps a shared code in every scope", () => {
        expect(apiErrorMessage("disband", "not_authenticated", t)).toBe("account.errorNotAuthenticated");
        expect(apiErrorMessage("email", "invalid_password", t)).toBe("account.invalidPassword");
        expect(apiErrorMessage("delete", "password_required", t)).toBe("account.passwordRequired");
        expect(apiErrorMessage("delete", "server_misconfigured", t)).toBe("account.errorServer");
    });

    it("maps scope-specific codes", () => {
        expect(apiErrorMessage("disband", "not_owner", t)).toBe("account.errorNotOwner");
        expect(apiErrorMessage("email", "email_taken", t)).toBe("account.errorEmailTaken");
        expect(apiErrorMessage("delete", "owner", t)).toBe("account.ownerTransferFirst");
    });

    it("falls back to the scope's generic message", () => {
        expect(apiErrorMessage("disband", "disband_failed", t)).toBe("account.errorDisband");
        expect(apiErrorMessage("email", "email_update_failed", t)).toBe("account.errorEmailUpdate");
        expect(apiErrorMessage("email", undefined, t)).toBe("account.errorEmailUpdate");
        expect(apiErrorMessage("delete", "delete_failed", t)).toBe("account.errorDelete");
    });

    it("does not leak one scope's code into another", () => {
        // `not_owner` only means something for disband; elsewhere it is generic.
        expect(apiErrorMessage("delete", "not_owner", t)).toBe("account.errorDelete");
    });
});
