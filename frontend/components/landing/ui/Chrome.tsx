"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/language-switcher/LanguageSwitcher";
import { Link } from "@/i18n/navigation";
import { APP_ENTRY, CHAPTERS } from "../content";
import { scrollToChapter } from "../hooks";

const HIDE_AFTER_PX = 120;
const SCROLL_NOISE_PX = 6;

/** Hides while scrolling down and returns on any upward scroll or near the top. */
function useHideOnScrollDown() {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const last = useRef(0);

  useEffect(() => {
    last.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - last.current;
      setScrolled(y > 8);
      if (y < HIDE_AFTER_PX) setHidden(false);
      else if (delta > SCROLL_NOISE_PX) setHidden(true);
      else if (delta < -SCROLL_NOISE_PX) setHidden(false);
      if (Math.abs(delta) > SCROLL_NOISE_PX) last.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return { hidden, scrolled };
}

export function TopBar() {
  const t = useTranslations("landing");
  const { hidden, scrolled } = useHideOnScrollDown();
  return (
    <header
      data-hidden={hidden}
      data-scrolled={scrolled}
      className="landing-topbar pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between landing-gutter py-3 md:py-3.5"
    >
      <a href="#origin" onClick={(e) => { e.preventDefault(); scrollToChapter("origin"); }} className="landing-focus pointer-events-auto whitespace-nowrap font-display text-[11px] font-semibold tracking-[0.24em] text-stellar md:text-[13px] md:tracking-[0.32em]">
        THE ORIGIN PROJECT
      </a>
      <div className="pointer-events-auto flex items-center gap-2 md:gap-3">
        <LanguageSwitcher className="!h-9 !gap-2 !border-white/25 !bg-void/35 !px-3.5 !text-[13px] backdrop-blur-md hover:!border-pulse" />
        <Link href={APP_ENTRY} className="landing-focus landing-button landing-button--sm landing-button--ghost pointer-events-auto">
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
      <div className="h-full bg-pulse transition-[width] duration-500" style={{ width: `${((active + 1) / CHAPTERS.length) * 100}%` }} />
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
          return <circle key={i} cx={x} cy={y} r={r} fill={i % 9 === 0 ? "#6f9be8" : "#F4F6FC"} opacity={0.35 + (i % 4) * 0.15} />;
        })}
      </svg>
      <div className="landing-static-planet" />
    </div>
  );
}
