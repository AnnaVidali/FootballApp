"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
import { authErrorMessage } from "@/lib/auth-errors";
import { isRecoveryCallbackUrl } from "@/lib/utils";

// supabase-js consumes the recovery token and the `type=recovery` marker from
// the URL while it initialises, so capture this before creating the client.
// Next.js caches route modules, so the effect below claims and clears the flag
// on mount: a later client-side visit must not inherit an earlier recovery.
let recoveryLinkPending =
    typeof window !== "undefined" && isRecoveryCallbackUrl(window.location.href);

const supabase = createClient();

export default function ResetPasswordPage() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [invalid, setInvalid] = useState(false);
    const router = useRouter();
    const { t } = useLocaleContext();

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "PASSWORD_RECOVERY" && session) {
                setReady(true);
            }
        });

        // A session is only sufficient on a recovery-link load: the token
        // exchange may finish before the listener above is attached. On an
        // ordinary visit, a signed-in user must not be able to set a new
        // password without proving they own the account.
        const hasRecoveryLink = recoveryLinkPending;
        recoveryLinkPending = false;
        if (hasRecoveryLink) {
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (session) setReady(true);
            });
        }

        // The recovery token arrives in the URL and is exchanged for a
        // session asynchronously. Give that exchange a generous window before
        // calling the link bad -- at 3s a slow network marked a perfectly
        // valid link as expired.
        const timeout = setTimeout(() => {
            setReady((prev) => {
                if (!prev) setInvalid(true);
                return prev;
            });
        }, 8000);

        return () => {
            subscription.unsubscribe();
            clearTimeout(timeout);
        };
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (password.length < 6) {
            setError(t("account.passwordMinLength"));
            return;
        }
        if (password !== confirmPassword) {
            setError(t("account.passwordsNoMatch"));
            return;
        }
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.updateUser({ password });
        setLoading(false);

        if (error) {
            setError(authErrorMessage(error, t));
        } else {
            await supabase.auth.signOut();
            router.push("/login");
            router.refresh();
        }
    }

    if (invalid) {
        return (
            <div className="rounded-lg bg-white p-8 shadow-md text-center">
                <h1 className="mb-4 text-2xl font-bold text-black">{t("auth.invalidLink")}</h1>
                <p className="mb-4 text-sm text-gray-600">
                    {t("auth.invalidLinkDesc")}
                </p>
                <Link
                    href="/forgot-password"
                    className="text-green-600 hover:underline text-sm font-medium"
                >
                    {t("auth.requestNewLink")}
                </Link>
            </div>
        );
    }

    if (!ready) {
        return <p className="text-gray-500">{t("common.loading")}</p>;
    }

    return (
        <div className="rounded-lg bg-white p-8 shadow-md">
            <h1 className="mb-6 text-2xl font-bold text-center text-black">{t("auth.setNewPassword")}</h1>

            {error && (
                <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label
                        htmlFor="new-password"
                        className="block text-sm font-medium text-gray-700"
                    >
                        {t("auth.newPassword")}
                    </label>
                    <input
                        id="new-password"
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-black focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                </div>

                <div>
                    <label
                        htmlFor="confirm-password"
                        className="block text-sm font-medium text-gray-700"
                    >
                        {t("auth.confirmPassword")}
                    </label>
                    <input
                        id="confirm-password"
                        type="password"
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-black focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-md bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-50"
                >
                    {loading ? t("common.saving") : t("auth.updatePassword")}
                </button>
            </form>
        </div>
    );
}
