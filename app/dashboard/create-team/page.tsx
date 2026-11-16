"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
import ColorField from "@/components/ColorField";
import { MAX_LOGO_BYTES, uniqueStorageName } from "@/lib/utils";

const supabase = createClient();

export default function CreateTeamPage() {
    const [teamName, setTeamName] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const router = useRouter();
    const { t } = useLocaleContext();
    const [primaryColour, setPrimaryColour] = useState("#16a34a");
    const [secondaryColour, setSecondaryColour] = useState("#ffffff");
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [settingsWarning, setSettingsWarning] = useState("");

    function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        // Same cap the settings page enforces; without it a huge image was
        // uploaded and only failed later, after the team already existed.
        if (file && file.size > MAX_LOGO_BYTES) {
            setError(t("settings.logoTooLarge"));
            e.target.value = "";
            return;
        }
        setError("");
        setLogoFile(file);
    }

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

        const { data: team, error: teamError } = await supabase
            .from("teams")
            .insert({ name: teamName, owner_id: user.id })
            .select()
            .maybeSingle();
        if (teamError) {
            const message = teamError.message.includes("duplicate")
                ? t("team.duplicateName")
                : t("team.createFailed", { error: teamError.message });
            setError(message);
            setLoading(false);
            return;
        }

        const { error: profileError } = await supabase
            .from("profiles")
            .update({ team_id: team.id, is_admin: true, role: "coach" })
            .eq("user_id", user.id);
        if (profileError) {
            setError(t("team.profileFailed", { error: profileError.message }));
            setLoading(false);
            return;
        }

        if (logoFile) {
            // A fresh object name per upload, so a later logo change in the
            // settings page does not serve the cached first logo.
            const fileName = `${team.id}/${uniqueStorageName(logoFile.name)}`;
            const { error: uploadError } = await supabase.storage
                .from("team-logos")
                .upload(fileName, logoFile);
            if (uploadError) {
                setSettingsWarning(t("team.settingsFailed", { error: uploadError.message }));
            } else {
                const { data: urlData } = supabase.storage
                    .from("team-logos")
                    .getPublicUrl(fileName);
                const { error: settingsError } = await supabase
                    .from("teams")
                    .update({
                        logo_url: urlData.publicUrl,
                        primary_color: primaryColour,
                        secondary_color: secondaryColour,
                    })
                    .eq("id", team.id);
                if (settingsError) {
                    setSettingsWarning(t("team.settingsFailed", { error: settingsError.message }));
                }
            }
        } else {
            const { error: settingsError } = await supabase
                .from("teams")
                .update({
                    primary_color: primaryColour,
                    secondary_color: secondaryColour,
                })
                .eq("id", team.id);
            if (settingsError) {
                setSettingsWarning(t("team.settingsFailed", { error: settingsError.message }));
            }
        }

        setInviteCode(team.invite_code);
        setLoading(false);
    }

    return (
        <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-black mb-6">{t("team.createTeam")}</h1>
            {inviteCode ? (
                <div className="rounded-lg p-6 text-center" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)" }}>
                    <h2 className="text-lg font-bold mb-2" style={{ color: "var(--primary-display)" }}>{t("team.teamCreated")}</h2>
                    <p className="text-sm mb-4" style={{ color: "color-mix(in srgb, var(--primary) 70%, black)" }}>
                        {t("team.shareInviteCode")}
                    </p>
                    <p className="text-3xl font-mono font-bold mb-6" style={{ color: "var(--primary-display)" }}>
                        {inviteCode}
                    </p>
                    {settingsWarning && (
                        <p className="text-sm text-red-600 mb-4" role="alert">{settingsWarning}</p>
                    )}
                    <button
                        onClick={() => { router.push("/dashboard"); router.refresh(); }}
                        className="w-full rounded-md px-4 py-2 font-medium"
                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                    >
                        {t("team.goToDashboard")}
                    </button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="team-name" className="block text-sm font-medium text-gray-700 mb-1">
                            {t("team.teamName")}
                        </label>
                        <input
                            id="team-name"
                            type="text"
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            required
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                            placeholder={t("team.namePlaceholder")}
                        />
                    </div>
                    <ColorField
                        id="primary-color"
                        label={t("team.primaryColor")}
                        value={primaryColour}
                        onChange={setPrimaryColour}
                    />
                    <ColorField
                        id="secondary-color"
                        label={t("team.secondaryColor")}
                        value={secondaryColour}
                        onChange={setSecondaryColour}
                    />
                    <div>
                        <label htmlFor="team-logo" className="block text-sm font-medium text-gray-700 mb-1">
                            {t("team.logoOptional")}
                        </label>
                        <input
                            id="team-logo"
                            type="file"
                            accept="image/*"
                            onChange={handleLogoChange}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:font-medium"
                        />
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
                        {loading ? t("team.creating") : t("team.createTeam")}
                    </button>
                </form>
            )}
        </div>
    );
}
