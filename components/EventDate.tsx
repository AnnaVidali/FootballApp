"use client";

import { useLocaleContext } from "@/lib/i18n-context";

export default function EventDate({ date }: { date: string }) {
  const { locale } = useLocaleContext();
  const dateFmt = locale === "es" ? "es-ES" : "en-GB";
  return (
    <>
      {new Date(date).toLocaleDateString(dateFmt, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </>
  );
}