import { redirect } from "next/navigation";
import type { Metadata } from "next";
import SettingsClient from "@/components/SettingsClient";
import { getSessionContext } from "@/lib/session";
import { pageMetadata } from "@/lib/page-metadata";

export async function generateMetadata(): Promise<Metadata> {
    return pageMetadata("nav.settings");
}

export default async function SettingsPage() {
    const { user, profile, team } = await getSessionContext();
    if (!user) redirect("/login");
    if (!profile?.team_id || !team) redirect("/dashboard");

    return (
        <SettingsClient
            teamId={team.id}
            initialName={team.name}
            initialPrimaryColour={team.primary_color || "#16a34a"}
            initialSecondaryColour={team.secondary_color || "#ffffff"}
            initialLogoUrl={team.logo_url}
            isAdmin={profile.is_admin}
        />
    );
}
