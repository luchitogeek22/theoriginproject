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
