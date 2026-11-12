"use client";

import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/language-switcher/LanguageSwitcher";
import { Link } from "@/i18n/navigation";
import { APP_ENTRY, CHAPTERS } from "../content";
import { scrollToChapter } from "../hooks";

export function TopBar() {
  const t = useTranslations("landing");
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-void via-void/80 to-transparent px-4 pb-8 pt-4 md:bg-none md:px-8 md:py-5">
      <a href="#origin" onClick={(e) => { e.preventDefault(); scrollToChapter("origin"); }} className="landing-focus pointer-events-auto whitespace-nowrap font-display text-[11px] font-semibold tracking-[0.24em] text-stellar md:text-[13px] md:tracking-[0.32em]">
        THE ORIGIN PROJECT
      </a>
      <div className="pointer-events-auto flex items-center gap-2 md:gap-3">
        <LanguageSwitcher />
        <Link href={APP_ENTRY} className="landing-focus landing-button landing-button--ghost pointer-events-auto">
          <span className="md:hidden">{t("topBar.enterShort")}</span>
          <span className="hidden md:inline">{t("topBar.enter")}</span>
        </Link>
      </div>
    </header>
  );
}

export function ProgressRail({ active }: { active: number }) {
  const t = useTranslations("landing");
  return (
    <nav aria-label={t("rail.label")} className="fixed right-3 top-1/2 z-30 hidden -translate-y-1/2 md:block lg:right-6">
      <ol className="flex flex-col gap-3">
        {CHAPTERS.map((c, i) => (
          <li key={c.id}>
            <a
              href={`#${c.id}`}
              onClick={(e) => { e.preventDefault(); scrollToChapter(c.id); }}
              aria-current={i === active ? "step" : undefined}
              className="landing-focus landing-rail group flex items-center justify-end gap-3"
            >
              <span className="landing-rail__label">{t(`chapters.${c.id}`)}</span>
              <span className="landing-rail__tick" />
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function ScrollMeter({ active }: { active: number }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 h-px bg-stellar/10 md:hidden" aria-hidden>
      <div className="h-full bg-ion transition-[width] duration-500" style={{ width: `${((active + 1) / CHAPTERS.length) * 100}%` }} />
    </div>
  );
}

/** Shown before the WebGL scene loads, and instead of it when WebGL is unavailable. */
export function StaticSky() {
  return (
    <div className="landing-static-sky absolute inset-0" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1600 900">
        {Array.from({ length: 220 }, (_, i) => {
          const x = (i * 7919) % 1600;
          const y = (i * 104729) % 900;
          const r = i % 17 === 0 ? 1.6 : i % 5 === 0 ? 1 : 0.6;
          return <circle key={i} cx={x} cy={y} r={r} fill={i % 9 === 0 ? "#42D9F5" : "#F4F6FC"} opacity={0.35 + (i % 4) * 0.15} />;
        })}
      </svg>
      <div className="landing-static-planet" />
    </div>
  );
}
