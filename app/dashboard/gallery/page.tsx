import type { Metadata } from "next";
import GalleryClient, {
    GALLERY_PAGE_SIZE,
    type EventOption,
} from "@/components/GalleryClient";
import { getSessionContext } from "@/lib/session";
import { pageMetadata } from "@/lib/page-metadata";
import type { GalleryItem } from "@/types/database";

/** Events shown in the tag/filter dropdowns; older ones load by reference. */
const EVENT_OPTION_LIMIT = 200;

export async function generateMetadata(): Promise<Metadata> {
    return pageMetadata("nav.gallery");
}

export default async function GalleryPage() {
    const { supabase, user, profile } = await getSessionContext();

    if (!user || !profile?.team_id) {
        return (
            <GalleryClient
                teamId={null}
                profileId={null}
                initialItems={[]}
                initialSignedUrls={{}}
                initialMemberNames={{}}
                initialEvents={[]}
            />
        );
    }

    const teamId = profile.team_id;

    const [{ data: members }, { data: itemRows }] = await Promise.all([
        supabase.from("profiles").select("id, name").eq("team_id", teamId),
        supabase
            .from("gallery_items")
            .select("*")
            .eq("team_id", teamId)
            .order("created_at", { ascending: false })
            .limit(GALLERY_PAGE_SIZE),
    ]);

    const items = (itemRows ?? []) as GalleryItem[];

    // The dropdown lists recent events, but a photo tagged to an older event
    // must still show that event's title, so those are fetched by id too.
    const referencedIds = [
        ...new Set(items.map((item) => item.event_id).filter(Boolean)),
    ] as string[];
    const [{ data: recentEvents }, { data: referencedEvents }] = await Promise.all([
        supabase
            .from("events")
            .select("id, title, date")
            .eq("team_id", teamId)
            .order("date", { ascending: false })
            .limit(EVENT_OPTION_LIMIT),
        referencedIds.length > 0
            ? supabase.from("events").select("id, title, date").in("id", referencedIds)
            : Promise.resolve({ data: [] }),
    ]);
    const eventMap = new Map<string, EventOption>();
    [...(recentEvents ?? []), ...(referencedEvents ?? [])].forEach((event) => {
        eventMap.set(event.id, event as EventOption);
    });
    const events = [...eventMap.values()].sort((a, b) => b.date.localeCompare(a.date));

    const paths = items
        .filter((item) => item.kind === "photo" && item.storage_path)
        .map((item) => item.storage_path as string);
    const signedUrls: Record<string, string> = {};
    if (paths.length > 0) {
        const { data: signed } = await supabase.storage
            .from("gallery")
            .createSignedUrls(paths, 60 * 60 * 6);
        (signed ?? []).forEach((entry) => {
            if (entry.path && entry.signedUrl) signedUrls[entry.path] = entry.signedUrl;
        });
    }

    const memberNames: Record<string, string> = {};
    (members ?? []).forEach((member) => {
        memberNames[member.id] = member.name;
    });

    return (
        <GalleryClient
            teamId={teamId}
            profileId={profile.id}
            initialItems={items}
            initialSignedUrls={signedUrls}
            initialMemberNames={memberNames}
            initialEvents={events}
        />
    );
}
