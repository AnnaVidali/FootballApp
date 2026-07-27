import { cookies } from "next/headers";
import {
  type Locale,
  type TranslationDictionary,
  getDictionary,
  t as translate,
  defaultLocale,
} from "./i18n";

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("locale")?.value;
  if (raw === "en" || raw === "es") return raw;
  return defaultLocale;
}

export async function getServerDictionary(): Promise<TranslationDictionary> {
  const locale = await getServerLocale();
  return getDictionary(locale);
}

export async function getServerT(): Promise<
  (key: string, params?: Record<string, string | number>) => string
> {
  const dict = await getServerDictionary();
  return (key, params) => translate(dict, key, params);
}
