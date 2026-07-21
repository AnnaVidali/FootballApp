"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateTeamPage() {
    const [teamName, setTeamName] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [inviteCode, setInviteCode] = useState<string | null>(null);
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
        // 1. Create the team
        const { data: team, error: teamError } = await supabase
            .from("teams")
            .insert({ name: teamName, coach_id: user.id })
            .select()
            .maybeSingle();
        if (teamError) {
            setError(teamError.message);
            setLoading(false);
            return;
        }
        // 2. Update profile: set team_id + is_admin
        const { error: profileError } = await supabase
            .from("profiles")
            .update({ team_id: team.id, is_admin: true })
            .eq("user_id", user.id);
        if (profileError) {
            setError(profileError.message);
            setLoading(false);
            return;
        }
        // 3. Show invite code
        setInviteCode(team.invite_code);
        setLoading(false);
    }

    return (
        <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-black mb-6">Create a Team</h1>
            {inviteCode ? (
                <div className="rounded-lg bg-green-50 p-6 text-center">
                    <h2 className="text-lg font-bold text-green-800 mb-2">Team Created!</h2>
                    <p className="text-sm text-green-700 mb-4">
                        Share this invite code with your players:
                    </p>
                    <p className="text-3xl font-mono font-bold text-green-900 mb-6">
                        {inviteCode}
                    </p>
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="w-full rounded-md bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700"
                    >
                        Go to Dashboard
                    </button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Team Name
                        </label>
                        <input
                            type="text"
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            required
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                            placeholder="e.g. Las Bravas FC"
                        />
                    </div>
                    {error && (
                        <p className="text-sm text-red-600">{error}</p>
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-md bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                        {loading ? "Creating..." : "Create Team"}
                    </button>
                </form>
            )}
        </div>
    );
}