"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
import AlertModal from "@/components/AlertModal";
import ColorField from "@/components/ColorField";
import { MAX_LOGO_BYTES, uniqueStorageName } from "@/lib/utils";

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
    const objectUrlRef = useRef<string | null>(null);
    const router = useRouter();
    const { t } = useLocaleContext();

    // The preview object URL is not garbage collected with the state that
    // holds it, so release it on unmount as well as when it is replaced.
    useEffect(
        () => () => {
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        },
        []
    );

    function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        if (file && file.size > MAX_LOGO_BYTES) {
            setAlertMsg(t("settings.logoTooLarge"));
            setAlertOpen(true);
            e.target.value = "";
            return;
        }
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
        setLogoFile(file);
        if (file) {
            const url = URL.createObjectURL(file);
            objectUrlRef.current = url;
            setLogoPreview(url);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!isAdmin) return;
        setLoading(true);
        setMessage("");

        // Fall back to the stored URL, never the preview: after a re-upload
        // the preview is a `blob:` address that would be useless in the
        // database.
        let logoUrl = initialLogoUrl;
        if (logoFile) {
            // A fresh object name per upload: reusing the file's own name
            // wrote the same path, so the public URL never changed and
            // browsers kept showing the old cached logo.
            const fileName = `${teamId}/${uniqueStorageName(logoFile.name)}`;
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
                <ColorField
                    id="settings-primary-color"
                    label={t("settings.primaryColor")}
                    value={primaryColour}
                    onChange={setPrimaryColour}
                    disabled={!isAdmin}
                />
                <ColorField
                    id="settings-secondary-color"
                    label={t("settings.secondaryColor")}
                    value={secondaryColour}
                    onChange={setSecondaryColour}
                    disabled={!isAdmin}
                />
                <div>
                    <label htmlFor="settings-team-logo" className="block text-sm font-medium text-gray-700 mb-1">
                        {t("settings.teamLogo")}
                    </label>
                    {logoPreview && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={logoPreview}
                            alt={t("common.teamLogoAlt")}
                            className="mb-2 h-16 w-16 rounded-full object-cover"
                        />
                    )}
                    {isAdmin ? (
                        <input
                            id="settings-team-logo"
                            type="file"
                            accept="image/*"
                            onChange={handleLogoChange}
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
