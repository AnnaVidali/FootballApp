"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocaleContext } from "@/lib/i18n-context";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function Sidebar({
    teamLogo,
    teamName,
    userName,
    isAdmin,
    role,
    isOwner,
    onCloseAction,
}: {
    teamLogo: string | null;
    teamName: string | null;
    userName: string;
    isAdmin: boolean;
    role: string;
    isOwner: boolean;
    onCloseAction: () => void;
}) {
    const pathname = usePathname();
    const { t } = useLocaleContext();

    const navLinks = [
        { href: "/dashboard", label: t("nav.dashboard"), icon: "\ud83c\udfe0" },
        { href: "/dashboard/roster", label: t("nav.roster"), icon: "\ud83d\udc65" },
        { href: "/dashboard/events", label: t("nav.events"), icon: "\ud83d\udcc5" },
        { href: "/dashboard/lineup", label: t("nav.lineup"), icon: "\u26bd" },
        { href: "/dashboard/settings", label: t("nav.settings"), icon: "\u2699\ufe0f" },
        { href: "/dashboard/account", label: t("nav.account"), icon: "\ud83d\udc64" },
    ];

    function getRoleLabel(): string {
        if (role === "coach") return t("roles.adminCoach");
        if (isAdmin) return t("roles.admin");
        return t("roles.player");
    }

    return (
        <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
            <div className="border-b border-gray-200 p-4">
                <div className="flex items-center gap-3">
                    {teamLogo ? (
                        <img src={teamLogo} alt={teamName || "Team logo"} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                        <span className="text-2xl">⚽</span>
                    )}
                    <div>
                        <h2 className="text-lg font-bold text-black truncate">
                            {teamName || t("sidebar.noTeam")}
                        </h2>
                        {teamName && (
                        <>
                        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary-text)" }}>
                            {getRoleLabel()}
                        </span>
                        {isOwner && (
                            <span className="ml-1 inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                                {t("roles.owner")}
                            </span>
                        )}
                        </>
                        )}
                    </div>
                </div>
            </div>

            <div className="border-b border-gray-200 px-4 py-2">
                <LanguageSwitcher />
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
