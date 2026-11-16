import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";

// The page itself is a client component, so the title is set by this
// one-line layout instead.
export async function generateMetadata(): Promise<Metadata> {
    return pageMetadata("events.newEvent");
}

export default function NewEventLayout({ children }: { children: React.ReactNode }) {
    return children;
}
