"use client";

import { useTransition } from "react";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { localeNames, locales, type Locale } from "@/i18n/config";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * Native `<select>`: keyboard and screen-reader support for free, and it scales to any number
 * of languages. Switching keeps the current page, query and hash; the router updates the
 * `NEXT_LOCALE` cookie so the choice survives reloads and later visits.
 */
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("language");
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: Locale) {
    if (next === locale) return;
    const { search, hash } = window.location;
    startTransition(() => {
      router.replace(`${pathname}${search}${hash}`, { locale: next, scroll: false });
    });
  }

  return (
    <label
      className={`relative inline-flex items-center gap-1.5 rounded border border-line bg-deep px-2 py-1 text-[11px] text-mutedstar transition-colors focus-within:border-pulse hover:text-starlight ${
        pending ? "opacity-60" : ""
      } ${className}`}
    >
      <Languages size={13} aria-hidden />
      <span className="sr-only">{t("label")}</span>
      <select
        value={locale}
        onChange={(e) => change(e.target.value as Locale)}
        disabled={pending}
        aria-label={t("change", { language: localeNames[locale] })}
        className="cursor-pointer appearance-none bg-transparent pr-1 text-starlight outline-none"
      >
        {locales.map((l) => (
          <option key={l} value={l} lang={l} className="bg-deep text-starlight">
            {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
