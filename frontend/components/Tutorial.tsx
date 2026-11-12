"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { useTranslations } from "next-intl";

const STEPS = ["pick", "watch", "understand", "share"] as const;

export default function Tutorial() {
  const t = useTranslations("tutorial");
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem("origin-tutorial-done")) setStep(0);
    } catch {
      setStep(0);
    }
  }, []);

  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const open = step !== null;

  const close = useCallback(() => {
    setStep(null);
    try {
      localStorage.setItem("origin-tutorial-done", "1");
    } catch { /* noop */ }
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    if (el && document.contains(el)) el.focus();
    else document.querySelector<HTMLElement>("main")?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <AnimatePresence>
      {step !== null && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-label={t("dialogLabel")}
          className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,430px)] -translate-x-1/2 rounded-lg border border-line bg-panel p-4 shadow-2xl outline-none"
        >
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-widest text-pulse">{t("step", { current: step + 1, total: STEPS.length })}</p>
            <button onClick={close} aria-label={t("close")} className="text-mutedstar hover:text-starlight">
              <X size={15} />
            </button>
          </div>
          <p className="mb-1 text-sm font-semibold text-starlight">{t(`steps.${STEPS[step]}.title`)}</p>
          <p className="mb-3 text-xs leading-relaxed text-mutedstar">{t(`steps.${STEPS[step]}.body`)}</p>
          <div className="flex justify-between">
            <button onClick={close} className="text-xs text-mutedstar hover:text-starlight">
              {t("skip")}
            </button>
            <button
              onClick={() => (step >= 3 ? close() : setStep(step + 1))}
              className="flex items-center gap-1 rounded bg-pulse px-3 py-1.5 text-xs font-semibold text-starlight hover:brightness-110"
            >
              {step >= 3 ? t("start") : t("next")} <ArrowRight size={13} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
