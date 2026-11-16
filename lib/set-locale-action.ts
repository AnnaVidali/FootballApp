"use server";

import { cookies } from "next/headers";
import type { Locale } from "./i18n";

export async function setLocale(locale: Locale) {
  const cookieStore = await cookies();
  // The locale is only ever read on the server (the client gets it through
  // the provider), so it can be httpOnly and, in production, https-only.
  cookieStore.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
