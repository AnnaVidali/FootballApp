"use client";

import { useRouter } from "next/navigation";
import { useLocaleContext } from "@/lib/i18n-context";
import { setLocale } from "@/lib/set-locale-action";
import type { Locale } from "@/lib/i18n";

const labels: Record<Locale, string> = {
  en: "🇬🇧",
  es: "🇪🇸",
};

export default function LanguageSwitcher() {
  const { locale } = useLocaleContext();
  const router = useRouter();

  async function switchLocale(newLocale: Locale) {
    if (newLocale === locale) return;
    await setLocale(newLocale);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      {(["en", "es"] as Locale[]).map((l) => (
        <button
          key={l}
          onClick={() => switchLocale(l)}
          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            l === locale
              ? "bg-gray-900 text-white"
              : "bg-gray-200 text-gray-600 hover:bg-gray-300"
          }`}
          aria-label={`Switch to ${l === "en" ? "English" : "Español"}`}
        >
          {labels[l]}
        </button>
      ))}
    </div>
  );
}
