import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { defaultLocale, locales, ogLocales, type Locale } from "./config";
import { localizedPath } from "./paths";

/** Public origin used for canonical and hreflang URLs. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  "http://localhost:3000"
).replace(/\/$/, "");

export type PageKey =
  | "observatory"
  | "livingSky"
  | "timeExplorer"
  | "spectralLab"
  | "candidates"
  | "journal"
  | "login"
  | "demo"
  | "landing";

/** Indexable pages and their locale-less paths (sitemap source). Private pages are excluded. */
export const PUBLIC_PAGES: ReadonlyArray<{ key: PageKey; path: string }> = [
  { key: "landing", path: "/" },
  { key: "observatory", path: "/observatory" },
  { key: "livingSky", path: "/living-sky" },
  { key: "timeExplorer", path: "/time-explorer" },
  { key: "spectralLab", path: "/spectral-lab" },
  { key: "candidates", path: "/candidates" },
  { key: "demo", path: "/demo" },
];

/** `hreflang` map for a locale-less path, including `x-default` (English). */
export function languageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of locales) languages[locale] = localizedPath(locale, path);
  languages["x-default"] = localizedPath(defaultLocale, path);
  return languages;
}

/** Translated title, description, canonical, hreflang and Open Graph for one page. */
export async function pageMetadata(
  locale: Locale,
  page: PageKey,
  path: string,
  options: { index?: boolean } = {},
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "metadata" });
  const title = t(`${page}.title`);
  const description = t(`${page}.description`);
  const url = localizedPath(locale, path);
  return {
    title,
    description,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      title,
      description,
      url,
      siteName: t("siteName"),
      locale: ogLocales[locale],
      alternateLocale: locales.filter((l) => l !== locale).map((l) => ogLocales[l]),
      type: "website",
    },
    robots: options.index === false ? { index: false, follow: false } : undefined,
  };
}

/** `generateMetadata` for a route segment layout. */
export function metadataFor(page: PageKey, path: string, options: { index?: boolean } = {}) {
  return ({ params }: { params: { locale: Locale } }) => pageMetadata(params.locale, page, path, options);
}
