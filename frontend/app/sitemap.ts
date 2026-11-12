import type { MetadataRoute } from "next";
import { defaultLocale } from "@/i18n/config";
import { PUBLIC_PAGES, SITE_URL, languageAlternates } from "@/i18n/metadata";
import { localizedPath } from "@/i18n/paths";

/** One entry per public page (English URL) with every language variant as an alternate. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map(({ path }) => {
    const languages = languageAlternates(path);
    delete languages["x-default"];
    return {
      url: `${SITE_URL}${localizedPath(defaultLocale, path)}`,
      alternates: {
        languages: Object.fromEntries(Object.entries(languages).map(([l, p]) => [l, `${SITE_URL}${p}`])),
      },
    };
  });
}
