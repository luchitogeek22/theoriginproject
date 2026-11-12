"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localeNames, locales, type Locale } from "@/i18n/config";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * Two-button segmented switch: with only two locales this reads as a real toggle, not a
 * form control. `aria-pressed` carries the current selection for assistive tech; switching
 * keeps the current page, query and hash, same as before.
 */
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("language");
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: Locale) {
    if (next === locale || pending) return;
    const { search, hash } = window.location;
    startTransition(() => {
      router.replace(`${pathname}${search}${hash}`, { locale: next, scroll: false });
    });
  }

  return (
    <div
      role="group"
      aria-label={t("label")}
      className={`inline-flex rounded-full border border-line/80 bg-abyss/60 p-0.5 ${pending ? "opacity-60" : ""} ${className}`}
    >
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          disabled={pending}
          aria-pressed={locale === l}
          onClick={() => change(l)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
            locale === l ? "bg-pulse text-abyss" : "text-mutedstar hover:text-starlight"
          }`}
        >
          {localeNames[l]}
        </button>
      ))}
    </div>
  );
}
