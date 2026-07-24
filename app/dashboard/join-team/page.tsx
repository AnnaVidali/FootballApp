"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function JoinTeamPage() {
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setError("Not logged in");
            setLoading(false);
            return;
        }
        // Find the team with this invite code
        const { data: team } = await supabase
            .from("teams")
            .select("id")
            .eq("invite_code", code.trim().toUpperCase())
            .maybeSingle();
        if (!team) {
            setError("Invalid invite code. Check with your admin for the correct code.");
            setLoading(false);
            return;
        }
        // Link user to the team
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
            <h1 className="text-2xl font-bold text-black mb-6">Join a Team</h1>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="invite-code" className="block text-sm font-medium text-gray-700 mb-1">
                        Invite Code
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
                        Ask your coach or captain for the code
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
                    {loading ? "Joining..." : "Join Team"}
                </button>
            </form>
        </div>
    );
}