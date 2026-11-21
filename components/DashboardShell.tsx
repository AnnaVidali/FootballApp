"use client";

import React from "react";
import Sidebar from "@/components/Sidebar";
import SignOutButton from "@/components/SignOutButton";
import { useLocaleContext } from "@/lib/i18n-context";

export default function DashboardShell({
    children,
    teamLogo,
    teamName,
    userName,
    isAdmin,
    role,
    isOwner,
    appVersion,
}: {
    children: React.ReactNode;
    teamLogo: string | null;
    teamName: string | null;
    userName: string;
    isAdmin: boolean;
    role: string;
    isOwner: boolean;
    appVersion: string;
}) {
    const [isOpen, setIsOpen] = React.useState(false);
    const sidebarId = React.useId();
    const hamburgerRef = React.useRef<HTMLButtonElement>(null);
    const sidebarRef = React.useRef<HTMLDivElement>(null);
    const { t } = useLocaleContext();

    React.useEffect(() => {
        if (!isOpen) return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                setIsOpen(false);
                hamburgerRef.current?.focus();
            }
        }
        window.addEventListener("keydown", onKeyDown);
        // Move focus into the drawer so a keyboard user is not left on the
        // hamburger with the navigation visually covering the page.
        sidebarRef.current?.querySelector<HTMLElement>("nav a")?.focus();
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isOpen]);

    return (
        <div className="flex h-screen overflow-hidden">
            {/* Skip to content link */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow-md focus:text-sm focus:font-medium focus:text-gray-900"
            >
                {t("shell.skipToContent")}
            </a>
            {/* Hamburger button - mobile only */}
            <button
                ref={hamburgerRef}
                onClick={() => setIsOpen(true)}
                className="fixed top-4 left-4 z-50 rounded-md bg-white p-2 shadow-md md:hidden"
                aria-label={t("shell.openNav")}
                aria-controls={sidebarId}
                aria-expanded={isOpen}
            >
                ☰
            </button>
            {/* Overlay - mobile only, when sidebar is open. A button so it
                can be dismissed with the keyboard, not just a pointer. */}
            {isOpen && (
                <button
                    type="button"
                    onClick={() => { setIsOpen(false); hamburgerRef.current?.focus(); }}
                    aria-label={t("shell.closeNav")}
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                />
            )}
            {/* Sidebar column. `invisible` while closed on mobile keeps its
                links out of the tab order and the accessibility tree. */}
            <div
                ref={sidebarRef}
                id={sidebarId}
                className={`flex flex-col ${
                    isOpen ? "visible translate-x-0" : "invisible -translate-x-full"
                } fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 md:visible md:relative md:translate-x-0`}
            >
                <Sidebar
                    teamLogo={teamLogo}
                    teamName={teamName}
                    userName={userName}
                    isAdmin={isAdmin}
                    role={role}
                    isOwner={isOwner}
                    appVersion={appVersion}
                    onCloseAction={() => setIsOpen(false)}
                />
                <div className="border-t border-gray-200 p-4">
                    <SignOutButton />
                </div>
            </div>
            {/* Main content */}
            <main id="main-content" className="flex-1 overflow-y-auto bg-gray-50 pt-16 pl-16 pr-4 md:p-6">
                {children}
            </main>
        </div>
    );
}
