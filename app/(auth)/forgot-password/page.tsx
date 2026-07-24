"use client";

import React, { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const supabase = createClient();

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
            <h1 className="mb-6 text-2xl font-bold text-center text-black">Reset Password</h1>

            {sent ? (
                <div className="text-center">
                    <p className="mb-4 text-sm text-gray-600">
                        Check your email for a password reset link.
                    </p>
                    <Link
                        href="/login"
                        className="text-green-600 hover:underline text-sm font-medium"
                    >
                        Back to Login
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
                                Email
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
                            {loading ? "Sending..." : "Send Reset Link"}
                        </button>
                    </form>

                    <p className="mt-4 text-center text-sm text-gray-600">
                        Remember your password?{" "}
                        <Link href="/login" className="text-green-600 hover:underline">
                            Login
                        </Link>
                    </p>
                </>
            )}
        </div>
    );
}
