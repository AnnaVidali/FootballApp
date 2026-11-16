"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";

const supabase = createClient();

export default function JoinTeamClient({
    currentTeamName,
    canLeave,
}: {
    currentTeamName: string | null;
    canLeave: boolean;
}) {
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { t } = useLocaleContext();

    // Warning, not a block: a regular player may switch teams, which is a
    // leave. The owner and the last admin may not (035 enforces it in the
    // database), so the form is disabled for them with the reason shown.
    const isBlocked = !canLeave;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setError(t("auth.notLoggedIn"));
            setLoading(false);
            return;
        }
        const { data: teamId, error: joinError } = await supabase.rpc("join_team_with_code", {
            p_code: code,
        });
        if (joinError) {
            setError(joinErrorMessage(joinError));
            setLoading(false);
            return;
        }
        if (!teamId) {
            setError(t("joinTeam.invalidCode"));
            setLoading(false);
            return;
        }
        router.push("/dashboard");
        router.refresh();
    }

    function joinErrorMessage(joinError: {
        code?: string;
        details?: string;
        message?: string;
    }): string {
        // 043 raises with this DETAIL so the page can tell the two cases
        // apart; an invalid code now comes back as a null result.
        if (joinError.details === "join_rate_limited") {
            return t("joinTeam.tooManyAttempts");
        }
        // 035 refuses a move the caller may not make (owner / last admin).
        // Without this branch it was reported as "invalid code".
        if (
            joinError.code === "42501" ||
            (joinError.message ?? "").includes("Transfer ownership")
        ) {
            return t("joinTeam.cannotLeave");
        }
        return t("joinTeam.invalidCode");
    }

    return (
        <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-black mb-6">{t("joinTeam.title")}</h1>
            {isBlocked && (
                <p className="mb-4 text-sm text-red-600" role="alert">
                    {t("joinTeam.cannotLeave")}
                </p>
            )}
            {currentTeamName && canLeave && (
                <p className="mb-4 text-sm text-amber-700" role="status">
                    {t("joinTeam.currentTeamWarning", { team: currentTeamName })}
                </p>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="invite-code" className="block text-sm font-medium text-gray-700 mb-1">
                        {t("joinTeam.inviteCode")}
                    </label>
                    <input
                        id="invite-code"
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        required
                        placeholder={t("joinTeam.codePlaceholder")}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-black uppercase tracking-wider text-center text-lg font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        {t("joinTeam.askCoach")}
                    </p>
                </div>
                {error && (
                    <p className="text-sm text-red-600" role="alert">{error}</p>
                )}
                <button
                    type="submit"
                    disabled={loading || isBlocked}
                    aria-busy={loading}
                    className="w-full rounded-md px-4 py-2 font-medium disabled:opacity-50"
                    style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                >
                    {loading ? t("joinTeam.joining") : t("joinTeam.joinTeam")}
                </button>
            </form>
        </div>
    );
}
