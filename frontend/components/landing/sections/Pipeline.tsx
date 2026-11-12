"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { PIPELINE } from "../content";
import { useSectionProgress } from "../hooks";
import PipelineVisual from "../ui/PipelineVisual";

export default function Pipeline() {
  const t = useTranslations("landing.pipeline");
  const ref = useRef<HTMLElement>(null);
  const progress = useSectionProgress(ref);
  const [picked, setPicked] = useState<number | null>(null);
  const active = picked ?? Math.min(PIPELINE.length - 1, Math.floor(progress * PIPELINE.length));
  const step = PIPELINE[active];

  const jump = (i: number) => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(max-width: 767px)").matches) {
      setPicked(i);
      return;
    }
    setPicked(null);
    const travel = el.offsetHeight - window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: top + travel * ((i + 0.5) / PIPELINE.length), behavior: smooth ? "smooth" : "auto" });
  };

  return (
    <section ref={ref} id="evidence" data-chapter aria-labelledby="evidence-title" className="relative md:h-[340vh]">
      <div className="flex min-h-[100svh] md:sticky md:top-0 items-center px-4 py-20 md:px-10">
        <div className="grid w-full gap-10 md:grid-cols-12 md:items-center">
          <div className="landing-scrim md:col-span-5">
            <h2 id="evidence-title" className="landing-h2">{t("title")}</h2>
            <ol className="mt-6 grid gap-1">
              {PIPELINE.map((s, i) => (
                <li key={s.visual}>
                  <button
                    type="button"
                    onClick={() => jump(i)}
                    aria-current={i === active ? "step" : undefined}
                    className="landing-focus landing-step"
                  >
                    <span className="font-mono text-xs text-stellar/40">{i + 1}</span>
                    <span>{t(`steps.${s.visual}.title`)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <div className="md:col-span-6 md:col-start-7">
            <AnimatePresence mode="wait">
              <motion.div
                key={step.visual}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="landing-panel"
              >
                <PipelineVisual kind={step.visual} />
                <div className="mt-5 flex items-center gap-3">
                  <span className={`landing-status landing-status--${step.status}`}>{t(`status.${step.status}`)}</span>
                  <span className="font-mono text-xs text-stellar/40">
                    {t("stepOf", { current: active + 1, total: PIPELINE.length })}
                  </span>
                </div>
                <h3 className="mt-3 font-display text-xl text-stellar">{t(`steps.${step.visual}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stellar/75">{t(`steps.${step.visual}.detail`)}</p>
              </motion.div>
            </AnimatePresence>
            <p className="mt-4 text-xs text-stellar/45">
              {t("note")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
