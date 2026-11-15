"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
import AlertModal from "@/components/AlertModal";

const supabase = createClient();

export default function SettingsClient({
    teamId,
    initialName,
    initialPrimaryColour,
    initialSecondaryColour,
    initialLogoUrl,
    isAdmin,
}: {
    teamId: string;
    initialName: string;
    initialPrimaryColour: string;
    initialSecondaryColour: string;
    initialLogoUrl: string | null;
    isAdmin: boolean;
}) {
    const [teamName, setTeamName] = useState(initialName);
    const [primaryColour, setPrimaryColour] = useState(initialPrimaryColour);
    const [secondaryColour, setSecondaryColour] = useState(initialSecondaryColour);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(initialLogoUrl);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [messageIsError, setMessageIsError] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertMsg, setAlertMsg] = useState("");
    const router = useRouter();
    const { t } = useLocaleContext();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!isAdmin) return;
        setLoading(true);
        setMessage("");

        let logoUrl = logoPreview;
        if (logoFile) {
            const fileName = `${teamId}/${logoFile.name}`;
            const { error: uploadError } = await supabase.storage
                .from("team-logos")
                .upload(fileName, logoFile);
            if (uploadError) {
                setAlertMsg(t("settings.logoUploadFailed"));
                setAlertOpen(true);
                setLoading(false);
                return;
            }
            {
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
            setMessage(t("settings.saveFailed", { error: error.message }));
            setMessageIsError(true);
        } else {
            setMessage(t("settings.settingsSaved"));
            setMessageIsError(false);
            router.refresh();
        }
        setLoading(false);
    }

    return (
        <div className="max-w-md mx-auto">
            <AlertModal open={alertOpen} title={t("common.notice")} message={alertMsg} onClose={() => setAlertOpen(false)} />
            <h1 className="text-2xl font-bold text-black mb-6">{t("settings.teamSettings")}</h1>
            {message && (
                <p className={`mb-4 text-sm ${messageIsError ? "text-red-600" : ""}`} style={!messageIsError ? { color: "var(--primary-display)" } : undefined} role="status">
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
                                    setAlertMsg(t("settings.logoTooLarge"));
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
