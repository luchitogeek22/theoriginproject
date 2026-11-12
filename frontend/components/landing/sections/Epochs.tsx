"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSectionProgress } from "../hooks";
import { SIM_EPOCHS, simulatedReadout } from "../simulation";
import { stage } from "../stage";

/** Epoch numbers shown on the chips; labels come from `landing.epochs.epoch`. */
const EPOCH_NUMBERS = ["01", "02", "03"];

export default function Epochs() {
  const t = useTranslations("landing.epochs");
  const ref = useRef<HTMLElement>(null);
  const progress = useSectionProgress(ref);
  const [manual, setManual] = useState<number | null>(null);
  const [difference, setDifference] = useState(false);

  const scrolled = Math.min(1, Math.max(0, (progress - 0.15) / 0.6));
  const epoch = manual ?? scrolled;
  const readout = simulatedReadout(epoch);
  const nearest = SIM_EPOCHS.reduce((best, e, i) => (Math.abs(SIM_EPOCHS[best] - epoch) > Math.abs(e - epoch) ? i : best), 0);

  useEffect(() => {
    stage.epoch = epoch;
  }, [epoch]);
  useEffect(() => {
    stage.difference = difference ? 1 : 0;
  }, [difference]);
  useEffect(() => {
    if (progress <= 0 || progress >= 1) setManual(null);
  }, [progress]);

  return (
    <section ref={ref} id="epochs" data-chapter aria-labelledby="epochs-title" className="relative h-[260vh]">
      <div className="sticky top-0 flex min-h-[100svh] landing-gutter items-start pt-24 md:items-center md:pt-0">
        <div className="landing-scrim w-full max-w-md py-6">
          <p className="landing-badge">{t("badge")}</p>
          <h2 id="epochs-title" className="landing-h2 mt-4">{t("title")}</h2>
          <p className="landing-body mt-4">
            {t("body")}
          </p>

          <fieldset className="mt-6">
            <legend className="sr-only">{t("legend")}</legend>
            <div className="flex gap-2">
              {EPOCH_NUMBERS.map((number, i) => (
                <button
                  key={number}
                  type="button"
                  aria-pressed={nearest === i}
                  onClick={() => setManual(SIM_EPOCHS[i])}
                  className="landing-focus landing-chip"
                >
                  {t("epoch", { number })}
                </button>
              ))}
            </div>
            <label className="mt-4 block">
              <span className="sr-only">{t("range")}</span>
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(epoch * 1000)}
                onChange={(e) => setManual(Number(e.target.value) / 1000)}
                className="landing-range landing-focus w-full"
              />
            </label>
          </fieldset>

          <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm text-stellar/80">
            <input type="checkbox" checked={difference} onChange={(e) => setDifference(e.target.checked)} className="landing-switch landing-focus" />
            {t("difference")}
          </label>

          <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-stellar/10 pt-4 font-mono text-[11px]">
            <div>
              <dt className="text-stellar/45">{t("date")}</dt>
              <dd className="mt-1 text-stellar/80">{t("dateValue")}</dd>
            </div>
            <div>
              <dt className="text-stellar/45">{t("shift")}</dt>
              <dd className="mt-1 text-pulse">{readout.shiftPx.toFixed(2)} px</dd>
            </div>
            <div>
              <dt className="text-stellar/45">{t("brightness")}</dt>
              <dd className="mt-1 text-stellar">
                {readout.brightnessPct >= 0 ? "+" : ""}
                {readout.brightnessPct.toFixed(0)}%
              </dd>
            </div>
          </dl>

          <p className="mt-5 hidden text-xs leading-relaxed text-stellar/55 md:block">
            {t("why")}
          </p>
        </div>
      </div>
    </section>
  );
}
