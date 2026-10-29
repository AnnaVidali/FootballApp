"use client";

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
import AlertModal from "@/components/AlertModal";
import ConfirmModal from "@/components/ConfirmModal";
import { compressImage } from "@/lib/image";
import type { GalleryItem } from "@/types/database";

const supabase = createClient();

type EventOption = { id: string; title: string; date: string };

function uniqueName(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function GalleryPage() {
    const [teamId, setTeamId] = useState<string | null>(null);
    const [profileId, setProfileId] = useState<string | null>(null);
    const [memberNames, setMemberNames] = useState<Record<string, string>>({});
    const [events, setEvents] = useState<EventOption[]>([]);
    const [items, setItems] = useState<GalleryItem[]>([]);
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [uploadEventId, setUploadEventId] = useState("");
    const [linkUrl, setLinkUrl] = useState("");
    const [linkCaption, setLinkCaption] = useState("");
    const [linkEventId, setLinkEventId] = useState("");
    const [filter, setFilter] = useState("all");
    const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertMsg, setAlertMsg] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { t } = useLocaleContext();

    const loadItems = useCallback(async (tid: string) => {
        const { data } = await supabase
            .from("gallery_items")
            .select("*")
            .eq("team_id", tid)
            .order("created_at", { ascending: false });
        const rows = (data ?? []) as GalleryItem[];
        setItems(rows);

        const paths = rows
            .filter((r) => r.kind === "photo" && r.storage_path)
            .map((r) => r.storage_path as string);
        if (paths.length === 0) {
            setSignedUrls({});
            return;
        }
        const { data: signed } = await supabase.storage
            .from("gallery")
            .createSignedUrls(paths, 60 * 60 * 6);
        const map: Record<string, string> = {};
        (signed ?? []).forEach((entry) => {
            if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
        });
        setSignedUrls(map);
    }, []);

    useEffect(() => {
        let active = true;
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                if (active) setLoading(false);
                return;
            }
            const { data: profile } = await supabase
                .from("profiles")
                .select("id, team_id")
                .eq("user_id", user.id)
                .single();
            if (!profile?.team_id) {
                if (active) setLoading(false);
                return;
            }
            if (!active) return;
            setTeamId(profile.team_id);
            setProfileId(profile.id);

            const { data: members } = await supabase
                .from("profiles")
                .select("id, name")
                .eq("team_id", profile.team_id);
            if (active) {
                const names: Record<string, string> = {};
                (members ?? []).forEach((m) => {
                    names[m.id] = m.name;
                });
                setMemberNames(names);
            }

            const { data: ev } = await supabase
                .from("events")
                .select("id, title, date")
                .eq("team_id", profile.team_id)
                .order("date", { ascending: false });
            if (active) setEvents(ev ?? []);

            await loadItems(profile.team_id);
            if (active) setLoading(false);
        }
        load();
        return () => {
            active = false;
        };
    }, [loadItems]);

    function showAlert(message: string) {
        setAlertMsg(message);
        setAlertOpen(true);
    }

    async function handleFiles(list: FileList | null) {
        if (!list || !teamId || !profileId) return;
        const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
        if (files.length === 0) return;
        setBusy(true);
        const eventId = uploadEventId || null;
        for (const file of files) {
            try {
                const blob = await compressImage(file);
                // compressImage returns a JPEG, but falls back to the original
                // file (e.g. HEIC on iOS) if the browser can't decode it, so we
                // trust the blob's own type rather than assuming JPEG.
                const contentType = blob.type || "image/jpeg";
                const extension = contentType === "image/png" ? "png" : contentType === "image/heic" ? "heic" : "jpg";
                const path = `${teamId}/${uniqueName()}.${extension}`;
                const { error: uploadError } = await supabase.storage
                    .from("gallery")
                    .upload(path, blob, { contentType });
                if (uploadError) {
                    showAlert(uploadError.message);
                    continue;
                }
                const { error: insertError } = await supabase.from("gallery_items").insert({
                    team_id: teamId,
                    uploaded_by: profileId,
                    event_id: eventId,
                    kind: "photo",
                    storage_path: path,
                });
                if (insertError) {
                    // Roll back the orphaned file so the bucket stays in sync.
                    await supabase.storage.from("gallery").remove([path]);
                    showAlert(insertError.message);
                }
            } catch {
                showAlert(t("gallery.errorUpload"));
            }
        }
        setBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await loadItems(teamId);
    }

    async function handleAddLink(e: FormEvent) {
        e.preventDefault();
        if (!teamId || !profileId) return;
        let url = linkUrl.trim();
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        try {
            new URL(url);
        } catch {
            showAlert(t("gallery.invalidUrl"));
            return;
        }
        setBusy(true);
        const { error } = await supabase.from("gallery_items").insert({
            team_id: teamId,
            uploaded_by: profileId,
            event_id: linkEventId || null,
            kind: "link",
            external_url: url,
            caption: linkCaption.trim() || null,
        });
        setBusy(false);
        if (error) {
            showAlert(error.message);
            return;
        }
        setLinkUrl("");
        setLinkCaption("");
        setLinkEventId("");
        await loadItems(teamId);
    }

    async function handleDelete() {
        const item = items.find((i) => i.id === deleteId);
        setDeleteId(null);
        if (!item || !teamId) return;
        // Delete the row first: if that fails, the gallery keeps a working
        // entry instead of leaving a row whose stored file is already gone.
        const { error } = await supabase.from("gallery_items").delete().eq("id", item.id);
        if (error) {
            showAlert(t("gallery.deleteFailed", { error: error.message }));
            return;
        }
        if (item.kind === "photo" && item.storage_path) {
            await supabase.storage.from("gallery").remove([item.storage_path]);
        }
        await loadItems(teamId);
    }

    const visibleItems = items.filter((item) => {
        if (filter === "all") return true;
        if (filter === "general") return !item.event_id;
        return item.event_id === filter;
    });

    const eventTitles: Record<string, string> = {};
    events.forEach((e) => {
        eventTitles[e.id] = e.title;
    });

    function eventLabel(item: GalleryItem): string | null {
        if (!item.event_id) return null;
        return eventTitles[item.event_id] ?? t("gallery.general");
    }

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto">
                <h1 className="text-2xl font-bold text-black mb-6">{t("gallery.title")}</h1>
                <p className="text-gray-500">{t("common.loading")}</p>
            </div>
        );
    }

    if (!teamId) {
        return (
            <div className="max-w-2xl mx-auto">
                <h1 className="text-2xl font-bold text-black mb-6">{t("gallery.title")}</h1>
                <p className="text-gray-500">{t("sidebar.noTeam")}</p>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto">
            <AlertModal open={alertOpen} title={t("common.error")} message={alertMsg} onClose={() => setAlertOpen(false)} />
            <ConfirmModal
                open={deleteId !== null}
                title={t("gallery.deleteConfirmTitle")}
                message={t("gallery.deleteConfirmMessage")}
                confirmLabel={t("common.delete")}
                danger
                onConfirm={handleDelete}
                onCancel={() => setDeleteId(null)}
            />

            <h1 className="text-2xl font-bold text-black mb-1">{t("gallery.title")}</h1>
            <p className="text-sm text-gray-500 mb-6">{t("gallery.subtitle")}</p>

            {/* Add photos */}
            <div className="rounded-lg border border-gray-200 bg-white p-4 mb-6">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label htmlFor="gallery-upload-match" className="block text-sm font-medium text-gray-700 mb-1">
                            {t("gallery.tagMatch")}
                        </label>
                        <select
                            id="gallery-upload-match"
                            value={uploadEventId}
                            onChange={(e) => setUploadEventId(e.target.value)}
                            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                        >
                            <option value="">{t("gallery.noMatch")}</option>
                            {events.map((e) => (
                                <option key={e.id} value={e.id}>
                                    {e.title}
                                </option>
                            ))}
                        </select>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFiles(e.target.files)}
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={busy}
                        className="rounded-md px-4 py-2 text-sm font-medium text-[var(--primary-text)] disabled:opacity-60"
                        style={{ backgroundColor: "var(--primary)" }}
                    >
                        {busy ? t("gallery.uploading") : `\ud83d\udcf7 ${t("gallery.addPhotos")}`}
                    </button>
                </div>

                {/* Add Instagram link */}
                <form onSubmit={handleAddLink} className="mt-4 border-t border-gray-100 pt-4 flex flex-wrap items-end gap-3">
                    <div className="w-full sm:flex-1 sm:min-w-[220px] min-w-0">
                        <label htmlFor="gallery-link-url" className="block text-sm font-medium text-gray-700 mb-1">
                            {t("gallery.linkUrl")}
                        </label>
                        <input
                            id="gallery-link-url"
                            type="text"
                            value={linkUrl}
                            onChange={(e) => setLinkUrl(e.target.value)}
                            placeholder={t("gallery.linkUrlPlaceholder")}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                        />
                    </div>
                    <div className="w-full sm:flex-1 sm:min-w-[180px] min-w-0">
                        <label htmlFor="gallery-link-caption" className="block text-sm font-medium text-gray-700 mb-1">
                            {t("gallery.caption")}
                        </label>
                        <input
                            id="gallery-link-caption"
                            type="text"
                            value={linkCaption}
                            onChange={(e) => setLinkCaption(e.target.value)}
                            placeholder={t("gallery.captionPlaceholder")}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                        />
                    </div>
                    <div>
                        <label htmlFor="gallery-link-match" className="block text-sm font-medium text-gray-700 mb-1">
                            {t("gallery.tagMatch")}
                        </label>
                        <select
                            id="gallery-link-match"
                            value={linkEventId}
                            onChange={(e) => setLinkEventId(e.target.value)}
                            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                        >
                            <option value="">{t("gallery.noMatch")}</option>
                            {events.map((e) => (
                                <option key={e.id} value={e.id}>
                                    {e.title}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="submit"
                        disabled={busy || linkUrl.trim().length === 0}
                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-60"
                    >
                        {`\ud83d\udd17 ${t("gallery.addLink")}`}
                    </button>
                </form>
            </div>

            {/* Filter */}
            {items.length > 0 && (
                <div className="mb-4">
                    <label htmlFor="gallery-filter" className="sr-only">
                        {t("gallery.allMatches")}
                    </label>
                    <select
                        id="gallery-filter"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                    >
                        <option value="all">{t("gallery.allMatches")}</option>
                        <option value="general">{t("gallery.general")}</option>
                        {events.map((e) => (
                            <option key={e.id} value={e.id}>
                                {e.title}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {visibleItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
                    <p className="text-gray-500">{t("gallery.empty")}</p>
                    <p className="text-sm text-gray-400 mt-1">{t("gallery.emptyHint")}</p>
                </div>
            ) : (
                <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {visibleItems.map((item) => {
                        const label = eventLabel(item);
                        const uploader = memberNames[item.uploaded_by];
                        return (
                            <li key={item.id} className="group relative rounded-lg overflow-hidden border border-gray-200 bg-white">
                                {item.kind === "photo" ? (
                                    <button
                                        type="button"
                                        onClick={() => setLightbox(item)}
                                        className="block w-full"
                                        aria-label={t("gallery.viewPhoto")}
                                    >
                                        {item.storage_path && signedUrls[item.storage_path] ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={signedUrls[item.storage_path]}
                                                alt={item.caption || t("gallery.photo")}
                                                className="h-40 w-full object-cover"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="h-40 w-full bg-gray-100" />
                                        )}
                                    </button>
                                ) : (
                                    <a
                                        href={item.external_url ?? "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex h-40 w-full flex-col items-center justify-center gap-2 bg-gray-50 px-3 text-center"
                                    >
                                        <span className="text-3xl" aria-hidden="true">{"\ud83d\udcf8"}</span>
                                        <span className="text-sm font-medium text-blue-600">{t("gallery.openOnInstagram")}</span>
                                    </a>
                                )}

                                <div className="p-2">
                                    {item.caption && <p className="text-sm text-black line-clamp-2">{item.caption}</p>}
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {label && <span>{label} · </span>}
                                        {uploader && <span>{t("gallery.uploadedBy")} {uploader}</span>}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setDeleteId(item.id)}
                                    className="absolute top-2 right-2 rounded-md bg-black/60 px-2.5 py-1.5 text-xs text-white hover:bg-black/80 focus:bg-black/80"
                                >
                                    {t("common.delete")}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Lightbox */}
            {lightbox && lightbox.storage_path && signedUrls[lightbox.storage_path] && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setLightbox(null)}
                    role="dialog"
                    aria-modal="true"
                >
                    <button
                        type="button"
                        onClick={() => setLightbox(null)}
                        className="absolute top-4 right-4 rounded-md bg-white/90 px-3 py-1 text-sm font-medium text-black"
                    >
                        {t("gallery.close")}
                    </button>
                    <div className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={signedUrls[lightbox.storage_path]}
                            alt={lightbox.caption || t("gallery.photo")}
                            className="max-h-[80vh] w-auto rounded-lg"
                        />
                        {lightbox.caption && (
                            <p className="mt-2 text-center text-sm text-white">{lightbox.caption}</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
