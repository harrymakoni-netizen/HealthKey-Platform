// Generated from interface.tsv. Every active locale has a complete key set.
import type { Locale } from "@/lib/contracts";
import data from "./interface.json";
export const copy = data as Record<Locale, Record<string, string>>;
export const languageNames: Record<Locale, string> = {
  en: "English",
  nd: "IsiNdebele",
  zu: "isiZulu",
  xh: "isiXhosa",
  af: "Afrikaans",
};
export const languageTags: Record<Locale, string> = {
  en: "en",
  nd: "nd",
  zu: "zu",
  xh: "xh",
  af: "af",
};
export function normalizeLocale(value: unknown): Locale {
  return typeof value === "string" &&
    ["en", "nd", "zu", "xh", "af"].includes(value)
    ? (value as Locale)
    : "en";
}
export function translate(locale: Locale, key: string) {
  return copy[locale]?.[key] || copy.en[key] || key;
}
