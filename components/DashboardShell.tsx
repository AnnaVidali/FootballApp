"use client";

import React from "react";
import Sidebar from "@/components/Sidebar";
import SignOutButton from "@/components/SignOutButton";

export default function DashboardShell({
    children,
    teamLogo,
    teamName,
    primaryColor,
    secondaryColor,
    userName,
    isAdmin,
}: {
    children: React.ReactNode;
    teamLogo: string | null;
    teamName: string | null;
    primaryColor: string;
    secondaryColor: string;
    userName: string;
    isAdmin: boolean
}) {
    const [isOpen, setIsOpen] = React.useState(false);

    React.useEffect(() => {
        document.documentElement.style.setProperty("--primary", primaryColor);
        document.documentElement.style.setProperty("--secondary", secondaryColor);

        // Auto-generate button text color based on primary brightness
        const r = parseInt(primaryColor.slice(1, 3), 16);
        const g = parseInt(primaryColor.slice(3, 5), 16);
        const b = parseInt(primaryColor.slice(5, 7), 16);

        // Use relative luminance (WCAG formula) for better contrast
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        // For saturated bright colors (high max channel, low min channel),
        // force black text even if luminance is low
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        const useBlackText = saturation > 0.5 && max > 150 ? true : luminance > 128;
        document.documentElement.style.setProperty(
            "--primary-text",
            useBlackText ? "#000000" : "#ffffff"
        );

        // Display color: primary readable on white backgrounds
        if (luminance > 180) {
            // Light color - mix 60% primary + 40% black
            const dr = Math.round(r * 0.6);
            const dg = Math.round(g * 0.6);
            const db = Math.round(b * 0.6);
            document.documentElement.style.setProperty(
                "--primary-display",
                `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`
            );
        } else {
            document.documentElement.style.setProperty("--primary-display", primaryColor);
        }
    }, [primaryColor, secondaryColor]);

    return (
        <div className="flex h-screen overflow-hidden">
            {/* Hamburger button - mobile only */}
            <button
                onClick={() => setIsOpen(true)}
                className="fixed top-4 left-4 z-50 rounded-md bg-white p-2 shadow-md md:hidden"
            >
                ☰
            </button>
            {/* Overlay - mobile only, when sidebar is open */}
            {isOpen && (
                <div
                    onClick={() => setIsOpen(false)}
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                />
            )}
            {/* Sidebar column */}
            <div
                className={`flex flex-col ${
                    isOpen ? "translate-x-0" : "-translate-x-full"
                } fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 md:relative md:translate-x-0`}
            >
                <Sidebar
                    teamLogo={teamLogo}
                    teamName={teamName}
                    userName={userName}
                    isAdmin={isAdmin}
                    onCloseAction={() => setIsOpen(false)}
                />
                <div className="border-t border-gray-200 p-4">
                    <SignOutButton />
                </div>
            </div>
            {/* Main content */}
            <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
                {children}
            </main>
        </div>
    );
}