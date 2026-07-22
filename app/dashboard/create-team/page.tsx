"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateTeamPage() {
    const [teamName, setTeamName] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const router = useRouter();
    const supabase = createClient();
    const [primaryColour, setPrimaryColour] = useState("#16a34a");
    const [secondaryColour, setSecondaryColour] = useState("#ffffff");
    const [logoFile, setLogoFile] = useState<File | null>(null);

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
            const message = teamError.message.includes("duplicate")
                ? "A team with this name already exists!"
                : teamError.message;
            setError(message);
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

        // 3. Upload logo if provided
        if (logoFile) {
            const fileName = `${team.id}/${logoFile.name}`;
            const { error: uploadError } = await supabase.storage
                .from("team-logos")
                .upload(fileName, logoFile);
            if (!uploadError) {
                const { data: urlData } = supabase.storage
                    .from("team-logos")
                    .getPublicUrl(fileName);
                // 4. Update team with logo URL and colors
                await supabase
                    .from("teams")
                    .update({
                        logo_url: urlData.publicUrl,
                        primary_color: primaryColour,
                        secondary_color: secondaryColour,
                    })
                    .eq("id", team.id);
            }
        } else {
            // Just save colors even without logo
            await supabase
                .from("teams")
                .update({
                    primary_color: primaryColour,
                    secondary_color: secondaryColour,
                })
                .eq("id", team.id);
        }

        // 5. Show invite code
        setInviteCode(team.invite_code);
        setLoading(false);
    }

    return (
        <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-black mb-6">Create a Team</h1>
            {inviteCode ? (
                <div className="rounded-lg p-6 text-center" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)" }}>
                    <h2 className="text-lg font-bold mb-2" style={{ color: "var(--primary-display)" }}>Team Created!</h2>
                    <p className="text-sm mb-4" style={{ color: "color-mix(in srgb, var(--primary) 70%, black)" }}>
                        Share this invite code with your players:
                    </p>
                    <p className="text-3xl font-mono font-bold mb-6" style={{ color: "var(--primary-display)" }}>
                        {inviteCode}
                    </p>
                    <button
                        onClick={() => { router.push("/dashboard"); router.refresh(); }}
                        className="w-full rounded-md px-4 py-2 font-medium"
                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
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
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Primary Color
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={primaryColour}
                                onChange={(e) => setPrimaryColour(e.target.value)}
                                className="h-10 w-10 rounded border border-gray-300 cursor-pointer"
                            />
                            <span className="text-sm text-gray-500">{primaryColour}</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Secondary Color
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={secondaryColour}
                                onChange={(e) => setSecondaryColour(e.target.value)}
                                className="h-10 w-10 rounded border border-gray-300 cursor-pointer"
                            />
                            <span className="text-sm text-gray-500">{secondaryColour}</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Team Logo (optional)
                        </label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:font-medium"
                        />
                    </div>
                    {error && (
                        <p className="text-sm text-red-600">{error}</p>
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-md px-4 py-2 font-medium disabled:opacity-50"
                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                    >
                        {loading ? "Creating..." : "Create Team"}
                    </button>
                </form>
            )}
        </div>
    );
}