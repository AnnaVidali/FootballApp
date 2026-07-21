"use client";

import React from "react";
import Sidebar from "@/components/Sidebar";
import SignOutButton from "@/components/SignOutButton";

export default function DashboardShell({
    children,
    teamName,
    userName,
    isAdmin,
}: {
    children: React.ReactNode;
    teamName: string | null;
    userName: string;
    isAdmin: boolean
}) {
    const [isOpen, setIsOpen] = React.useState(false);

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