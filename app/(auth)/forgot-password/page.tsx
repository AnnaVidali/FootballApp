"use client";

import React, { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const supabase = createClient();
    const { t } = useLocaleContext();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        setSent(true);
        setLoading(false);
    }

    return (
        <div className="rounded-lg bg-white p-8 shadow-md">
            <h1 className="mb-6 text-2xl font-bold text-center text-black">{t("auth.resetPassword")}</h1>

            {sent ? (
                <div className="text-center">
                    <p className="mb-4 text-sm text-gray-600">
                        {t("auth.checkEmail")}
                    </p>
                    <Link
                        href="/login"
                        className="text-green-600 hover:underline text-sm font-medium"
                    >
                        {t("auth.backToLogin")}
                    </Link>
                </div>
            ) : (
                <>
                    {error && (
                        <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label
                                htmlFor="email"
                                className="block text-sm font-medium text-gray-700"
                            >
                                {t("auth.email")}
                            </label>
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-black focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                                placeholder="you@example.com"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-md bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                            {loading ? t("auth.sending") : t("auth.sendResetLink")}
                        </button>
                    </form>

                    <p className="mt-4 text-center text-sm text-gray-600">
                        {t("auth.rememberPassword")}{" "}
                        <Link href="/login" className="text-green-600 hover:underline">
                            {t("auth.login")}
                        </Link>
                    </p>
                </>
            )}
        </div>
    );
}
