/**
 * Single source of truth for supported languages.
 * Adding a locale: append it to `locales`, give it a native name and an Open Graph
 * code, and add `locales/<locale>/*.json` with the same keys as English.
 */
export const locales = ["en", "es"] as const;

export type Locale = (typeof locales)[number];

/** English is the default for every visitor without an explicit preference. */
export const defaultLocale: Locale = "en";

/** Languages are always shown with their native names. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

/** Open Graph `og:locale` values. */
export const ogLocales: Record<Locale, string> = {
  en: "en_US",
  es: "es_ES",
};

/** Cookie that remembers an explicit language choice between visits (one year). */
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Message files, one per functional domain. Every locale ships the same files. */
export const MESSAGE_FILES = ["common", "lib", "pages", "analysis", "sky", "components", "landing"] as const;
