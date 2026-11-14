"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { SHOW_EXTRA_PAGES } from "@/lib/features";
import { sequenceUrl } from "@/lib/sequenceParams";
import { VALIDATION_TARGETS } from "@/lib/targets";
import { TARGETS } from "../content";
import { stage } from "../stage";

export default function Objects() {
  const t = useTranslations("landing.objects");
  const [selected, setSelected] = useState(0);
  const target = TARGETS[selected];
  // With the living sky hidden, the call to action opens the target's own sequence.
  const validation = VALIDATION_TARGETS.find((vt) => vt.key === target.key);
  const ctaHref = SHOW_EXTRA_PAGES || !validation ? "/living-sky" : sequenceUrl(validation, undefined, validation.mode);


  useEffect(() => {
    stage.target = selected;
  }, [selected]);

  return (
    <section id="objects" data-chapter aria-labelledby="objects-title" className="relative md:h-[190vh]">
      <div className="landing-gutter flex min-h-[100svh] md:sticky md:top-0 items-center py-20">
        <div className="grid w-full gap-8 md:grid-cols-12">
          <div className="landing-scrim md:col-span-5">
            <h2 id="objects-title" className="landing-h2">{t("title")}</h2>
            <p className="landing-body mt-4">
              {t("body")}
            </p>
            <ul role="tablist" aria-label={t("tabsLabel")} className="mt-6 grid gap-1">
              {TARGETS.map((item, i) => (
                <li key={item.key} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    id={`tab-${item.key}`}
                    aria-selected={selected === i}
                    aria-controls="target-panel"
                    onClick={() => setSelected(i)}
                    className="landing-focus landing-target-tab"
                    style={{ ["--target" as string]: item.color }}
                  >
                    <span className={`landing-glyph landing-glyph--${item.phenomenon}`} aria-hidden />
                    <span className="font-display text-lg text-stellar">{item.name}</span>
                    <span className="ml-auto text-xs text-stellar/50">{t(`badge.${item.phenomenon}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-5 md:col-start-8 md:self-end">
            <AnimatePresence mode="wait">
              <motion.article
                key={target.key}
                id="target-panel"
                role="tabpanel"
                aria-labelledby={`tab-${target.key}`}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="landing-panel"
                style={{ ["--target" as string]: target.color }}
              >
                <p className="text-xs text-[color:var(--target)]">{t(`lookFor.${target.phenomenon}`)}</p>
                <h3 className="mt-2 font-display text-2xl text-stellar">{target.name}</h3>
                <p className="text-sm text-stellar/60">{t(`targets.${target.key}.kind`)}</p>
                <p className="mt-4 text-sm leading-relaxed text-stellar/80">{t(`targets.${target.key}.summary`)}</p>
                {target.key === "barnard" && <p className="mt-4 text-xs text-stellar/60">{t("targets.barnard.note")}</p>}
                <Link href={ctaHref} className="landing-focus landing-button landing-button--primary mt-6">
                  {t("cta")}
                </Link>
              </motion.article>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
