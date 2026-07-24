"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: "🏠" },
    { href: "/dashboard/roster", label: "Roster", icon: "👥" },
    { href: "/dashboard/events", label: "Events", icon: "📅" },
    { href: "/dashboard/lineup", label: "Lineup", icon: "⚽" },
    { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
    { href: "/dashboard/account", label: "Account", icon: "👤" },
];

export default function Sidebar({
    teamLogo,
    teamName,
    userName,
    isAdmin,
    role,
    onCloseAction,
}: {
    teamLogo: string | null;
    teamName: string | null;
    userName: string;
    isAdmin: boolean;
    role: string;
    onCloseAction: () => void;
}) {
    const pathname = usePathname();

    return (
        <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
            <div className="border-b border-gray-200 p-4">
                <div className="flex items-center gap-3">
                    {teamLogo ? (
                        <img src={teamLogo} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                        <span className="text-2xl">⚽</span>
                    )}
                    <div>
                        <h2 className="text-lg font-bold text-black truncate">
                            {teamName || "No Team"}
                        </h2>
                        {teamName && (
                        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary-text)" }}>
                            {role === "coach" ? "Admin · Coach" : isAdmin ? "Admin" : "Player"}
                        </span>
                        )}
                    </div>
                </div>
            </div>

            <nav className="flex-1 p-4 space-y-1" aria-label="Main navigation">
                {navLinks.map((link) => {
                    const isActive =
                        link.href === "/dashboard"
                          ? pathname === "/dashboard"
                          : pathname.startsWith(link.href);

                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={onCloseAction}
                            aria-current={isActive ? "page" : undefined}
                            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                                isActive
                                ? "text-[var(--primary-text)]"
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            }`}
                            style={isActive ? { backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)" } : undefined}
                        >
                        <span aria-hidden="true">{link.icon}</span>
                        {link.label}
                        </Link>
                   );
                })}
            </nav>

            <div className="border-t border-gray-200 p-4">
                <p className="mb-2 text-sm text-gray-500 truncate">{userName}</p>
            </div>
        </aside>
    );
}
