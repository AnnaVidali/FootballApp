"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
import AlertModal from "@/components/AlertModal";

const supabase = createClient();

export default function SettingsPage() {
    const [teamName, setTeamName] = useState("");
    const [primaryColour, setPrimaryColour] = useState("#16a34a");
    const [secondaryColour, setSecondaryColour] = useState("#ffffff");
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertMsg, setAlertMsg] = useState("");
    const [teamId, setTeamId] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const router = useRouter();
    const { t } = useLocaleContext();

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
    }, [router]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!teamId || !isAdmin) return;
        setLoading(true);
        setMessage("");

        let logoUrl = logoPreview;
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
            setMessage(t("common.error") + ": " + error.message);
        } else {
            setMessage(t("settings.settingsSaved"));
            router.refresh();
        }
        setLoading(false);
    }

    return (
        <div className="max-w-md mx-auto">
            <AlertModal open={alertOpen} title={t("common.notice")} message={alertMsg} onClose={() => setAlertOpen(false)} />
            <h1 className="text-2xl font-bold text-black mb-6">{t("settings.teamSettings")}</h1>
            {message && (
                <p className={`mb-4 text-sm ${message.includes(t("common.error")) ? "text-red-600" : ""}`} style={!message.includes(t("common.error")) ? { color: "var(--primary-display)" } : undefined} role="status">
                    {message}
                </p>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="settings-team-name" className="block text-sm font-medium text-gray-700 mb-1">
                        {t("settings.teamName")}
                    </label>
                    <input
                        id="settings-team-name"
                        type="text"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        disabled={!isAdmin}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-black disabled:bg-gray-100"
                    />
                </div>
                <div>
                    <label htmlFor="settings-primary-color" className="block text-sm font-medium text-gray-700 mb-1">
                        {t("settings.primaryColor")}
                    </label>
                    <div className="flex items-center gap-3">
                        <input
                            id="settings-primary-color"
                            type="color"
                            value={primaryColour}
                            onChange={(e) => setPrimaryColour(e.target.value)}
                            disabled={!isAdmin}
                            className="h-10 w-10 rounded border border-gray-300 cursor-pointer"
                        />
                        <span className="text-sm text-gray-500">{primaryColour}</span>
                    </div>
                </div>
                <div>
                    <label htmlFor="settings-secondary-color" className="block text-sm font-medium text-gray-700 mb-1">
                        {t("settings.secondaryColor")}
                    </label>
                    <div className="flex items-center gap-3">
                        <input
                            id="settings-secondary-color"
                            type="color"
                            value={secondaryColour}
                            onChange={(e) => setSecondaryColour(e.target.value)}
                            disabled={!isAdmin}
                            className="h-10 w-10 rounded border border-gray-300 cursor-pointer"
                        />
                        <span className="text-sm text-gray-500">{secondaryColour}</span>
                    </div>
                </div>
                <div>
                    <label htmlFor="settings-team-logo" className="block text-sm font-medium text-gray-700 mb-1">
                        {t("settings.teamLogo")}
                    </label>
                    {logoPreview && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={logoPreview}
                            alt="Team logo"
                            className="mb-2 h-16 w-16 rounded-full object-cover"
                        />
                    )}
                    {isAdmin ? (
                        <input
                            id="settings-team-logo"
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                if (file && file.size > 2 * 1024 * 1024) {
                                    setAlertMsg("Logo must be under 2MB.");
                                    setAlertOpen(true);
                                    e.target.value = "";
                                    return;
                                }
                                setLogoFile(file);
                                if (file) {
                                    setLogoPreview(URL.createObjectURL(file));
                                }
                            }}
                            className="w-full text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium"
                        />
                    ) : (
                        <p className="text-sm text-gray-400">{t("settings.adminLogoOnly")}</p>
                    )}
                </div>
                {isAdmin && (
                    <button
                        type="submit"
                        disabled={loading}
                        aria-busy={loading}
                        className="w-full rounded-md px-4 py-2 font-medium disabled:opacity-50"
                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                    >
                        {loading ? t("common.saving") : t("settings.saveChanges")}
                    </button>
                )}
            </form>
        </div>
    );
}
