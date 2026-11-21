/**
 * A stable error `code` from one of the app's own API routes, as a
 * translated message.
 *
 * The routes answer with a machine-readable `code` instead of an English
 * message, so the same failure reads correctly in every locale. Codes that
 * mean the same thing in more than one route share a message; the rest are
 * scoped to the route they came from. An unknown or missing code falls back
 * to the route's generic message, so a raw Supabase string can never reach
 * the user.
 */
export type ApiErrorScope = "disband" | "email" | "delete";

/** Codes whose meaning does not depend on the route that returned them. */
const SHARED: Record<string, string> = {
    not_authenticated: "account.errorNotAuthenticated",
    invalid_password: "account.invalidPassword",
    password_required: "account.passwordRequired",
    no_email: "account.errorNoEmail",
    server_misconfigured: "account.errorServer",
};

const SCOPED: Record<ApiErrorScope, { codes: Record<string, string>; fallback: string }> = {
    disband: {
        codes: {
            no_team: "account.errorNoTeam",
            not_owner: "account.errorNotOwner",
        },
        fallback: "account.errorDisband",
    },
    email: {
        codes: {
            email_unchanged: "account.emailUnchanged",
            invalid_email: "account.enterValidEmail",
            email_taken: "account.errorEmailTaken",
        },
        fallback: "account.errorEmailUpdate",
    },
    delete: {
        codes: {
            owner: "account.ownerTransferFirst",
            sole_admin: "account.soleAdminFirst",
        },
        fallback: "account.errorDelete",
    },
};

export function apiErrorMessage(
    scope: ApiErrorScope,
    code: string | undefined,
    t: (key: string) => string
): string {
    const key = (code && (SHARED[code] ?? SCOPED[scope].codes[code])) || SCOPED[scope].fallback;
    return t(key);
}
