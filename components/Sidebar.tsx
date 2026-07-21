"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/dashboard/roster", label: "Roster", icon: "👥" },
  { href: "/dashboard/events", label: "Events", icon: "📅" },
  { href: "/dashboard/lineup", label: "Lineup", icon: "⚽" },
];

export default function Sidebar({
  teamName,
  userName,
  isAdmin,
  onCloseAction,
}: {
  teamName: string | null;
  userName: string;
  isAdmin: boolean;
  onCloseAction: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-4">
        <h2 className="text-lg font-bold text-black truncate">
          {teamName || "No Team"}
        </h2>
        {teamName && (
          <span className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            {isAdmin ? "Admin" : "Player"}
          </span>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-1">
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
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-green-50 text-green-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span>{link.icon}</span>
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
