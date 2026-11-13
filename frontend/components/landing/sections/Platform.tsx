"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { APP_ENTRY, MODULES } from "../content";
import { scrollToChapter } from "../hooks";

export default function Platform() {
  const t = useTranslations("landing.platform");
  const [selected, setSelected] = useState(0);
  const [live, setLive] = useState(false);
  const mod = MODULES[selected];
  const name = t(`modules.${mod.key}.name`);

  const choose = (i: number) => {
    setSelected(i);
    setLive(false);
  };

  return (
    <section id="platform" data-chapter aria-labelledby="platform-title" className="landing-gutter relative flex min-h-[140vh] items-center py-24">
      <div className="grid w-full gap-10 md:grid-cols-12">
        <div className="landing-scrim md:col-span-4">
          <h2 id="platform-title" className="landing-h2">{t("title")}</h2>
          <p className="landing-body mt-4">
            {t("body")}
          </p>
          <div role="tablist" aria-label={t("tabsLabel")} className="mt-6 grid gap-1">
            {MODULES.map((m, i) => (
              <button
                key={m.href}
                type="button"
                role="tab"
                id={`module-${i}`}
                aria-selected={selected === i}
                aria-controls="module-panel"
                onClick={() => choose(i)}
                className="landing-focus landing-step"
              >
                {t(`modules.${m.key}.name`)}
              </button>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={APP_ENTRY} className="landing-focus landing-button landing-button--primary">
              {t("start")}
            </Link>
            <a href="#mission" onClick={(e) => { e.preventDefault(); scrollToChapter("mission"); }} className="landing-focus landing-button landing-button--ghost">
              {t("science")}
            </a>
          </div>
        </div>

        <div className="md:col-span-7 md:col-start-6">
          <div className="landing-window" id="module-panel" role="tabpanel" aria-labelledby={`module-${selected}`}>
            <div className="landing-window__bar">
              <span className="landing-window__dots" aria-hidden />
              <span className="font-mono text-[11px] text-stellar/55">theoriginproject{mod.href === "/" ? "/" : mod.href}</span>
            </div>
            <div className="relative aspect-[16/10] w-full overflow-hidden">
              <AnimatePresence mode="wait">
                {live ? (
                  <motion.iframe
                    key={`live-${mod.href}`}
                    src={mod.href}
                    title={t("previewTitle", { name })}
                    loading="lazy"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 h-full w-full border-0 bg-void"
                  />
                ) : (
                  <motion.div
                    key={mod.href}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 flex flex-col justify-end p-6 md:p-10"
                  >
                    <p className="font-display text-3xl font-light text-stellar md:text-5xl">{name}</p>
                    <p className="mt-3 max-w-md text-sm leading-relaxed text-stellar/70">{t(`modules.${mod.key}.purpose`)}</p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button type="button" onClick={() => setLive(true)} className="landing-focus landing-button landing-button--ghost hidden md:inline-flex">
                        {t("loadPreview")}
                      </button>
                      <Link href={mod.href} className="landing-focus landing-button landing-button--ghost">
                        {t("open", { name })}
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <p className="mt-3 text-xs text-stellar/45">
            {t("previewNote")}
          </p>
        </div>
      </div>
    </section>
  );
}
