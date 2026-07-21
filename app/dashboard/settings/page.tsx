"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
    const [teamName, setTeamName] = useState("");
    const [primaryColour, setPrimaryColour] = useState("#16a34a");
    const [secondaryColour, setSecondaryColour] = useState("#ffffff");
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [teamId, setTeamId] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    // Load current team data on page load
    useEffect(() => {
        async function loadTeam() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: profile } = await supabase
                .from("profiles")
                .select("team_id, is_admin")
                .eq("user_id", user.id)
                .single();
            if (!profile?.team_id) {
                router.push("/dashboard");
                return;
            }
            setIsAdmin(profile.is_admin);
            setTeamId(profile.team_id);
            const { data: team } = await supabase
                .from("teams")
                .select("name, primary_color, secondary_color, logo_url")
                .eq("id", profile.team_id)
                .single();
            if (team) {
                setTeamName(team.name);
                setPrimaryColour(team.primary_color || "#16a34a");
                setSecondaryColour(team.secondary_color || "#ffffff");
                setLogoPreview(team.logo_url);
            }
        }
        loadTeam();
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!teamId || !isAdmin) return;
        setLoading(true);
        setMessage("");

        let logoUrl = logoPreview;
        // Upload new logo if selected
        if (logoFile) {
            const fileName = `${teamId}/${logoFile.name}`;
            const { error: uploadError } = await supabase.storage
                .from("team-logos")
                .upload(fileName, logoFile);
            if (!uploadError) {
                const { data: urlData } = supabase.storage
                    .from("team-logos")
                    .getPublicUrl(fileName);
                logoUrl = urlData.publicUrl;
            }
        }

        // Update team
        const { error } = await supabase
            .from("teams")
            .update({
                name: teamName,
                primary_color: primaryColour,
                secondary_color: secondaryColour,
                logo_url: logoUrl,
            })
            .eq("id", teamId);
        if (error) {
            setMessage("Error: " + error.message);
        } else {
            setMessage("Settings saved!");
        }
        setLoading(false);
    }

    return (
        <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-black mb-6">Team Settings</h1>
            {message && (
                <p className={`mb-4 text-sm ${message.startsWith("Error") ? "text-red-600" : ""}`} style={!message.startsWith("Error") ? { color: "var(--primary-text)" } : undefined}>
                    {message}
                </p>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Team Name
                    </label>
                    <input
                        type="text"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        disabled={!isAdmin}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-black disabled:bg-gray-100 disabled:text-gray-500"
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
                            disabled={!isAdmin}
                            className="h-10 w-10 rounded border border-gray-300 cursor-pointer disabled:cursor-not-allowed"
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
                            disabled={!isAdmin}
                            className="h-10 w-10 rounded border border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <span className="text-sm text-gray-500">{secondaryColour}</span>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Team Logo
                    </label>
                    {logoPreview && (
                        <img
                            src={logoPreview}
                            alt="Team logo"
                            className="mb-2 h-16 w-16 rounded-full object-cover"
                        />
                    )}
                    {isAdmin ? (
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                setLogoFile(file);
                                if (file) {
                                    setLogoPreview(URL.createObjectURL(file));
                                }
                            }}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium"
                        />
                    ) : (
                        <p className="text-sm text-gray-400">Only admins can change the logo</p>
                    )}
                </div>
                {isAdmin && (
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-md px-4 py-2 font-medium disabled:opacity-50"
                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                    >
                        {loading ? "Saving..." : "Save Changes"}
                    </button>
                )}
            </form>
        </div>
    );
}