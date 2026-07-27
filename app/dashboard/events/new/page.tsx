"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";

export default function NewEventPage() {
    const [type, setType] = useState<"match" | "training">("training");
    const [title, setTitle] = useState("");
    const [date, setDate] = useState("");
    const [location, setLocation] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();
    const { t } = useLocaleContext();

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
        const { data: profile } = await supabase
            .from("profiles")
            .select("team_id, is_admin")
            .eq("user_id", user.id)
            .single();
        if (!profile?.is_admin) {
            setError(t("events.onlyAdminsCreate"));
            setLoading(false);
            return;
        }
        const { error: insertError } = await supabase.from("events").insert({
            team_id: profile.team_id,
            type,
            title,
            date: new Date(date).toISOString(),
            location: location || null,
        });
        if (insertError) {
            setError(insertError.message);
            setLoading(false);
            return;
        }
        router.push("/dashboard/events");
    }
    return (
        <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-black mb-6">{t("events.newEvent")}</h1>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="event-type" className="block text-sm font-medium text-gray-700 mb-1">
                        {t("events.eventType")}
                    </label>
                    <select
                        id="event-type"
                        value={type}
                        onChange={(e) => setType(e.target.value as "match" | "training")}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                    >
                        <option value="training">{t("events.trainingOption")}</option>
                        <option value="match">{t("events.matchOption")}</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="event-title" className="block text-sm font-medium text-gray-700 mb-1">
                        {t("events.typeTitle")}
                    </label>
                    <input
                        id="event-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        placeholder="e.g. Thursday Training"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                    />
                </div>
                <div>
                    <label htmlFor="event-date" className="block text-sm font-medium text-gray-700 mb-1">
                        {t("events.dateTime")}
                    </label>
                    <input
                        id="event-date"
                        type="datetime-local"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        required
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                    />
                </div>
                <div>
                    <label htmlFor="event-location" className="block text-sm font-medium text-gray-700 mb-1">
                        {t("events.location")}
                    </label>
                    <input
                        id="event-location"
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="e.g. Central Park Field"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
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
                    {loading ? t("events.creating") : t("events.createEvent")}
                </button>
            </form>
        </div>
    );
}
