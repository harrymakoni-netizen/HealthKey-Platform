"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { locales, type Locale } from "@/lib/contracts";
import {
  normalizeLocale,
  translate,
  languageNames,
  languageTags,
} from "@/i18n/copy";
const Context = createContext({
  locale: "en" as Locale,
  setLocale: (() => {}) as (locale: Locale) => void,
  t: (k: string) => k,
});
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setValue] = useState<Locale>("en");
  useEffect(() => {
    const v = document.cookie
      .split("; ")
      .find((x) => x.startsWith("hk_language="))
      ?.split("=")[1];
    setValue(normalizeLocale(v));
  }, []);
  useEffect(() => {
    document.documentElement.lang = languageTags[locale];
    document.cookie = `hk_language=${locale}; Path=/; SameSite=Strict; Max-Age=31536000${location.protocol === "https:" ? "; Secure" : ""}`;
  }, [locale]);
  return (
    <Context.Provider
      value={{ locale, setLocale: setValue, t: (k) => translate(locale, k) }}
    >
      {children}
    </Context.Provider>
  );
}
export const useLocale = () => useContext(Context);
export function LanguageSelector() {
  const { locale, setLocale, t } = useLocale();
  return (
    <label className="language-control">
      <span className="sr-only">{t("language")}</span>
      <select
        aria-label={t("language")}
        value={locale}
        onChange={(e) => setLocale(normalizeLocale(e.target.value))}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {languageNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
