"use client";

import { useEffect } from "react";

export default function DynamicFavicon({ logoUrl }: { logoUrl: string | null }) {
    useEffect(() => {
        const href = logoUrl || "/soccerballimage.png";

        // Remove all existing favicon links
        document.querySelectorAll("link[rel~='icon']").forEach((el) => el.remove());

        // Create a fresh one
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = href;
        document.head.appendChild(link);
    }, [logoUrl]);

    return null;
}
