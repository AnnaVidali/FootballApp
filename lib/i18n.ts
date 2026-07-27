import en from "../messages/en.json";
import es from "../messages/es.json";

export type Locale = "en" | "es";

export const locales: Locale[] = ["en", "es"];
export const defaultLocale: Locale = "en";

export type TranslationDictionary = typeof en;

const dictionaries: Record<Locale, TranslationDictionary> = { en, es };

export function getDictionary(locale: Locale): TranslationDictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

export function t(
  dict: TranslationDictionary,
  key: string,
  params?: Record<string, string | number>
): string {
  const parts = key.split(".");
  let value: unknown = dict;
  for (const part of parts) {
    if (value && typeof value === "object" && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  if (typeof value !== "string") return key;
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`
  );
}
