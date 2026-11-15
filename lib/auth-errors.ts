/**
 * A Supabase auth failure as a translated message.
 *
 * Supabase returns English text ("Invalid login credentials"), which used to
 * be shown verbatim even in the Spanish UI. The stable `code` is mapped to a
 * translated message instead, with a generic fallback so an unrecognised code
 * can never leak raw English to the user.
 */
type AuthErrorLike = { code?: string } | null | undefined;

export function authErrorMessage(
    error: AuthErrorLike,
    t: (key: string) => string
): string {
    switch (error?.code) {
        case "invalid_credentials":
            return t("auth.errorInvalidCredentials");
        case "email_not_confirmed":
            return t("auth.errorEmailNotConfirmed");
        case "user_already_exists":
        case "email_exists":
            return t("auth.errorUserExists");
        case "weak_password":
            return t("auth.errorWeakPassword");
        case "same_password":
            return t("auth.errorSamePassword");
        case "over_email_send_rate_limit":
        case "over_request_rate_limit":
            return t("auth.errorRateLimited");
        default:
            return t("auth.errorGeneric");
    }
}
