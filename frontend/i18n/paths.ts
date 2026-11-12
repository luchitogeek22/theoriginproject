import { defaultLocale, locales, type Locale } from "./config";

/** Splits `/es/journal/3` into `{ locale: "es", pathname: "/journal/3" }`; unprefixed paths are English. */
export function splitLocale(pathname: string): { locale: Locale; pathname: string } {
  for (const locale of locales) {
    if (locale === defaultLocale) continue;
    if (pathname === `/${locale}`) return { locale, pathname: "/" };
    if (pathname.startsWith(`/${locale}/`)) return { locale, pathname: pathname.slice(locale.length + 1) };
  }
  return { locale: defaultLocale, pathname };
}

/** Builds the public URL of a locale-less pathname for a locale (`as-needed` prefix strategy). */
export function localizedPath(locale: Locale, pathname: string): string {
  if (locale === defaultLocale) return pathname;
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

/**
 * Locale and locale-less path of a raw request pathname, decoded exactly like next-intl does
 * before routing (`decodeURI`, repeated slashes collapsed). Route guards must use this: the
 * raw pathname keeps percent-encoding, so `/%6Aournal` would not look like `/journal` even
 * though it renders the journal.
 */
export function routeOf(rawPathname: string): { locale: Locale; pathname: string } {
  let pathname = rawPathname;
  try {
    pathname = decodeURI(rawPathname);
  } catch {
    // Malformed escape sequences are left as they are; next-intl does the same.
  }
  return splitLocale(pathname.replace(/\/+/g, "/"));
}
