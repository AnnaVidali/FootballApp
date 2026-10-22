"use client";

import { useId, useSyncExternalStore } from "react";
import { useLocaleContext } from "@/lib/i18n-context";

// `useSyncExternalStore` is the supported way to read a browser-only value:
// the server snapshot (and the hydration pass) says "not on the client", then
// React re-renders with the client snapshot.
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

const OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * Renders an event date in the viewer's local timezone.
 *
 * Formatting a date during render is a classic hydration hazard: the server
 * formats it in the server's timezone (UTC in production) and the browser
 * formats it in the user's, so React sees two different strings for the same
 * element and throws a hydration error.
 *
 * The fix follows the pattern documented in the Next.js guide
 * "How to prevent flash before hydration": the server renders a deterministic
 * UTC value, and an inline script rewrites it in the viewer's timezone while
 * the browser is still parsing the HTML -- before the first paint, so the
 * user never sees the UTC value. `suppressHydrationWarning` tells React to
 * keep the (already correct) DOM instead of the server payload.
 *
 * The inline script only runs when the browser parses server HTML. React
 * builds the same element on the client for client components and for
 * client-side navigation, and a script inserted that way never executes, so
 * the UTC text stayed on screen (a 20:00 training was listed as 18:00).
 * `onClient` covers those renders and the hydration pass re-renders with it.
 */
export default function EventDate({ date }: { date: string }) {
  const id = useId();
  const { locale } = useLocaleContext();
  const dateFmt = locale === "es" ? "es-ES" : "en-GB";
  const onClient = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );

  const value = new Date(date);
  const text = onClient
    ? value.toLocaleDateString(dateFmt, OPTIONS)
    : value.toLocaleDateString(dateFmt, { ...OPTIONS, timeZone: "UTC" });

  // `</` can never appear in a date, but escape it anyway so the value can
  // never terminate the surrounding <script> element.
  const safeDate = JSON.stringify(date).replace(/</g, "\\u003c");

  return (
    <>
      <time id={id} dateTime={date} suppressHydrationWarning>
        {text}
      </time>
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `{var n=document.getElementById(${JSON.stringify(id)});if(n)n.textContent=new Date(${safeDate}).toLocaleDateString(${JSON.stringify(dateFmt)},${JSON.stringify(OPTIONS)})}`,
        }}
      />
    </>
  );
}
