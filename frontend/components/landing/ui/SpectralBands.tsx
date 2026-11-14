"use client";

import { KeyboardEvent, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ARRAY_FEATURES, CHANNELS_PER_ARRAY, DETECTOR_ARRAYS } from "../content";

const TOTAL = DETECTOR_ARRAYS.length * CHANNELS_PER_ARRAY;
const HUES = ["#4263FF", "#5a63ff", "#4f7fe0", "#6f9be8", "#6fa6f8", "#9dbcf2"];

export default function SpectralBands() {
  const t = useTranslations("landing.bands");
  const [band, setBand] = useState(52);
  const arrayIndex = Math.floor((band - 1) / CHANNELS_PER_ARRAY);
  const array = DETECTOR_ARRAYS[arrayIndex];

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? CHANNELS_PER_ARRAY : 1;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") setBand((b) => Math.min(TOTAL, b + step));
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setBand((b) => Math.max(1, b - step));
    else if (e.key === "Home") setBand(1);
    else if (e.key === "End") setBand(TOTAL);
    else return;
    e.preventDefault();
  };

  return (
    <div className="landing-bands">
      <div
        role="slider"
        tabIndex={0}
        aria-label={t("sliderLabel")}
        aria-valuemin={1}
        aria-valuemax={TOTAL}
        aria-valuenow={band}
        aria-valuetext={t("valueText", { band, array: array.index, from: String(array.from), to: String(array.to) })}
        onKeyDown={onKey}
        className="landing-focus flex h-24 items-end gap-[3px] rounded-sm md:h-28"
      >
        {DETECTOR_ARRAYS.map((arr, a) => (
          <div key={arr.index} className="flex h-full flex-1 items-end gap-[2px]">
            {Array.from({ length: CHANNELS_PER_ARRAY }, (_, c) => {
              const n = a * CHANNELS_PER_ARRAY + c + 1;
              const selected = n === band;
              const sameArray = a === arrayIndex;
              return (
                <button
                  key={n}
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  onPointerEnter={() => setBand(n)}
                  onClick={() => setBand(n)}
                  className="landing-band flex-1"
                  style={{
                    height: `${38 + ((c * 37 + a * 11) % 50)}%`,
                    background: HUES[a],
                    opacity: selected ? 1 : sameArray ? 0.65 : 0.22,
                    transform: selected ? "scaleY(1.12)" : undefined,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-stellar/50">
        <span>0.75 µm</span>
        <span>{t("wavelength")}</span>
        <span>5.0 µm</span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={array.index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="mt-5 grid gap-1"
        >
          <p className="font-mono text-xs text-pulse">
            {t("readout", { band, from: array.from.toFixed(2), to: array.to.toFixed(2) })}
          </p>
          <ul className="text-sm text-stellar/75">
            {ARRAY_FEATURES.map((f) => (
              <li key={f}>{t(`arrays.a${array.index}.${f}`)}</li>
            ))}
          </ul>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
