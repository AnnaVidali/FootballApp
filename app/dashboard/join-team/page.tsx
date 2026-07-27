"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";

export default function JoinTeamPage() {
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();
    const { t } = useLocaleContext();

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
        const { data: team } = await supabase
            .from("teams")
            .select("id")
            .eq("invite_code", code.trim().toUpperCase())
            .maybeSingle();
        if (!team) {
            setError(t("joinTeam.invalidCode"));
            setLoading(false);
            return;
        }
        const { error: updateError } = await supabase
            .from("profiles")
            .update({ team_id: team.id })
            .eq("user_id", user.id);
        if (updateError) {
            setError(updateError.message);
            setLoading(false);
            return;
        }
        router.push("/dashboard");
        router.refresh();
    }
    return (
        <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-black mb-6">{t("joinTeam.title")}</h1>
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
                        placeholder="e.g. ABC12345"
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
                    disabled={loading}
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
