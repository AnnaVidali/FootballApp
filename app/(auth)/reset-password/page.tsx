"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [invalid, setInvalid] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "PASSWORD_RECOVERY" && session) {
                setReady(true);
            }
        });

        // Also check if we already have a valid session (e.g. tokens already exchanged)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setReady(true);
            }
        });

        // If neither fires within 3s, the link is likely invalid
        const timeout = setTimeout(() => {
            setReady((prev) => {
                if (!prev) setInvalid(true);
                return prev;
            });
        }, 3000);

        return () => {
            subscription.unsubscribe();
            clearTimeout(timeout);
        };
    }, [supabase]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.updateUser({ password });
        setLoading(false);

        if (error) {
            setError(error.message);
        } else {
            await supabase.auth.signOut();
            router.push("/login");
            router.refresh();
        }
    }

    if (invalid) {
        return (
            <div className="rounded-lg bg-white p-8 shadow-md text-center">
                <h1 className="mb-4 text-2xl font-bold text-black">Invalid Link</h1>
                <p className="mb-4 text-sm text-gray-600">
                    This password reset link is invalid or has expired.
                </p>
                <Link
                    href="/forgot-password"
                    className="text-green-600 hover:underline text-sm font-medium"
                >
                    Request a new reset link
                </Link>
            </div>
        );
    }

    if (!ready) {
        return <p className="text-gray-500">Loading...</p>;
    }

    return (
        <div className="rounded-lg bg-white p-8 shadow-md">
            <h1 className="mb-6 text-2xl font-bold text-center text-black">Set New Password</h1>

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
                        New Password
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
                        Confirm Password
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
                    {loading ? "Saving..." : "Update Password"}
                </button>
            </form>
        </div>
    );
}
