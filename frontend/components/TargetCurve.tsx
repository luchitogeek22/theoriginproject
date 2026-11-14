import { useTranslations } from "next-intl";
import type { TargetKey } from "@/lib/targets";

/**
 * Decorative glyph for a validation target card: a rising line for a motion target, a wave
 * for a brightness one. Illustrative only — not plotted data (the real light curve lives in
 * the time explorer). Motion targets share one shape; brightness ones differ because these
 * two stars' real behavior differs (RW Aurigae's eruptive dimming is irregular, R Draconis's
 * pulsation is close to periodic), not from any value this component reads. A visible caption
 * and screen-reader text say so, so nobody reads it as a measurement.
 */
export default function TargetCurve({ targetKey }: { targetKey: TargetKey }) {
  const t = useTranslations("targetCurve");
  return (
    <span className="flex flex-col gap-0.5">
      <Glyph targetKey={targetKey} />
      <span data-testid="target-curve-caption" aria-hidden="true" className="text-[9px] uppercase tracking-[0.14em] text-mutedstar/70">
        {t("caption")}
      </span>
      <span className="sr-only">{t("description")}</span>
    </span>
  );
}

function Glyph({ targetKey }: { targetKey: TargetKey }) {
  const brightnessPaths: Partial<Record<TargetKey, string>> = {
    rwaur: "M2 14 14 8 26 18 38 6 50 20 62 10 74 16 86 4 98 12",
    rdra: "M2 13 C 14 2 26 2 38 13 S 62 24 74 13 S 92 2 98 8",
  };
  const brightnessPath = brightnessPaths[targetKey];

  if (brightnessPath) {
    return (
      <svg viewBox="0 0 100 26" className="h-6 w-full text-pulse" aria-hidden="true">
        <path d={brightnessPath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 26" className="h-6 w-full text-pulse" aria-hidden="true">
      <polyline points="2,22 22,17 42,13 62,10 82,7 98,3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="98" cy="3" r="2.5" fill="currentColor" />
    </svg>
  );
}
