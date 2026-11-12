import { defineRouting } from "next-intl/routing";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, defaultLocale, locales } from "./config";

/**
 * English lives at unprefixed URLs (`/time-explorer`) so existing and embedded links keep
 * working; every other language is prefixed (`/es/time-explorer`).
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
  localeCookie: { name: LOCALE_COOKIE, maxAge: LOCALE_COOKIE_MAX_AGE },
});
