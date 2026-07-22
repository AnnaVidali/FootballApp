"use client";

import { useEffect } from "react";

export default function DynamicFavicon({ logoUrl }: { logoUrl: string | null }) {
    useEffect(() => {
        const href = logoUrl || "/soccerballimage.png";
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
        if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
        }
        link.href = href;
    }, [logoUrl]);

    return null;
}
