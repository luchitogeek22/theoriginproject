import { useLocale, useTranslations } from "next-intl";
import type lib from "@/locales/en/lib.json";

type LimitationKey = keyof typeof lib.limitations;

/** Language the science service writes its limitation and data notes in. */
const SOURCE_LOCALE = "en";

/**
 * Backend notes are recognised by pattern and rendered from `limitations.<key>`.
 * Captured groups become ICU values in order of `params`; numeric groups are numbers so
 * plural rules apply. Scientific values (µm, px, detectors) are passed through untouched.
 */
const RULES: Array<{ pattern: RegExp; key: LimitationKey; params?: string[]; numeric?: string[] }> = [
  { pattern: /^Detectors? (.+?) (?:was|were) excluded: a sequence uses one detector \((D\d)\) because SPHEREx detectors cannot be mixed\.?$/, key: "detectorsExcluded", params: ["excluded", "detector"] },
  { pattern: /^(\d+) epochs available; (\d+) evenly spaced ones are shown \(maximum (\d+)\)\.?$/, key: "epochsShown", params: ["available", "shown", "max"], numeric: ["available", "shown", "max"] },
  { pattern: /^Each frame is shown in units of its own noise.*$/, key: "noiseUnits" },
  { pattern: /^One physical scale for all frames.*$/, key: "physicalScale" },
  { pattern: /^Motion mode uses detector D6.*$/, key: "motionDetector" },
  { pattern: /^(\d+) frame\(s\) could not be downloaded and are missing\.?$/, key: "framesMissing", params: ["count"], numeric: ["count"] },
  { pattern: /^Only one epoch is available.*$/, key: "singleEpoch" },
  { pattern: /^No frames available to build a sequence at this position\.?$/, key: "noFrames" },
  { pattern: /^(\d+) product\(s\) without a detector were excluded\.?$/, key: "productsWithoutDetector", params: ["count"], numeric: ["count"] },
  { pattern: /^Brightness mode keeps frames at the same wavelength: (\d+) of (\d+) are within ±([\d.]+) µm of ([\d.]+) µm\.?$/, key: "brightnessWavelength", params: ["kept", "total", "tolerance", "wavelength"], numeric: ["kept", "total"] },
  { pattern: /^The WISE reference frame could not be retrieved\.?$/, key: "wiseUnavailable" },
  { pattern: /^Gaia could not be reached.*$/, key: "gaiaUnavailable" },
  { pattern: /^No proper motion known for this position.*$/, key: "noProperMotion" },
  { pattern: /^One curve per detector; detectors are never mixed\. No aperture correction\.?$/, key: "curvePerDetector" },
  { pattern: /^The target saturates or is flagged in most frames of this detector, so its position cannot be measured reliably\.?$/, key: "knownMotionSaturated" },
  { pattern: /^No proper motion is known for this position, so the known-motion check was not run\.?$/, key: "knownMotionNoProperMotion" },
  { pattern: /^At least (\d+) frames are needed for the known-motion check; found (\d+)\.?$/, key: "knownMotionFewFrames", params: ["needed", "found"], numeric: ["needed", "found"] },
  { pattern: /^The field is too large to run the known-motion check quickly \((\d+) px; at most (\d+) px\); use a smaller field of view\.?$/, key: "knownMotionFieldTooLarge", params: ["size", "max"], numeric: ["size", "max"] },
  { pattern: /^One curve per detector; detectors are never mixed\. Aperture flux corrected with the SPHEREx ePSF in (\d+) of (\d+) frames\.?$/, key: "curvePerDetectorEpsf", params: ["corrected", "total"], numeric: ["corrected", "total"] },
  { pattern: /^The target saturates its core in this detector: the curve uses the amplitude of the PSF wings.*$/, key: "saturatedCore" },
  { pattern: /^The target is not detected individually in each frame \(median SNR ([\d.]+)\); the curve mostly shows noise\.?$/, key: "notDetected", params: ["snr"] },
  { pattern: /^The target is flagged .* in (\d+) of (\d+) frames in detector (D\d); try another detector.*$/, key: "targetFlagged", params: ["flagged", "total", "detector"], numeric: ["flagged", "total"] },
  { pattern: /^The target could not be measured in these frames\.?$/, key: "notMeasured" },
  { pattern: /^absolute flux \(no valid comparison stars\): not corrected for common changes$/, key: "absoluteFlux" },
  { pattern: /^relative to comparison stars$/, key: "relativeFlux" },
  { pattern: /^Only (\d+) Gaia star\(s\) were measurable here.*$/, key: "fewGaiaStars", params: ["count"], numeric: ["count"] },
  { pattern: /^Archive notice: (.*)$/, key: "archiveNotice", params: ["notice"] },
  { pattern: /^Queried on (.+), served from cache$/, key: "servedFromCache", params: ["date"] },
  { pattern: /^Linear motion over the observation window is assumed.*$/, key: "linearMotion" },
  { pattern: /^Pixels that are significantly bright in the median of all visits were treated as static sources.*$/, key: "staticSources" },
  { pattern: /^Velocities below ([\d.]+) arcsec\/yr \(less than ([\d.]+) px over the window\) are not searched.*$/, key: "minVelocity", params: ["velocity", "pixels"] },
  { pattern: /^The best velocity lies at the edge of the searched range.*$/, key: "velocityEdge" },
  { pattern: /^Velocity grid reduced to (\d+x\d+) to bound the computing cost\.?$/, key: "gridReduced", params: ["grid"] },
  { pattern: /^At least (\d+) visits are required; found (\d+)\.?$/, key: "minVisits", params: ["required", "found"], numeric: ["required", "found"] },
  { pattern: /^The empirical p-value compares the predicted position with random positions.*$/, key: "pValue" },
  { pattern: /^Total predicted motion over the window is ([\d.]+) px: below about 1\.5 px.*$/, key: "smallMotion", params: ["pixels"] },
  { pattern: /^Zodiacal light \(ZODI\) was subtracted from IMAGE\.?$/, key: "zodiImage" },
  { pattern: /^Zodiacal light was subtracted from every exposure\.?$/, key: "zodiEvery" },
  { pattern: /^Different dates are shown in different colours.*$/, key: "dateColours" },
  { pattern: /^No aperture correction is applied\.?$/, key: "noApertureCorrection" },
  { pattern: /^No celestial WCS.*$/, key: "noWcs" },
];

/**
 * Returns a translator for limitation notes sent by the science service. In the source
 * language the note is shown exactly as received; unknown notes are never invented, they
 * fall back to the original text.
 */
export function useTranslateLimitation(): (text: string) => string {
  const locale = useLocale();
  const t = useTranslations("limitations");
  return (text) => {
    if (locale === SOURCE_LOCALE) return text;
    const trimmed = text.trim();
    for (const rule of RULES) {
      const match = trimmed.match(rule.pattern);
      if (!match) continue;
      const values: Record<string, string | number> = {};
      (rule.params ?? []).forEach((name, i) => {
        const raw = match[i + 1];
        values[name] = rule.numeric?.includes(name) ? Number(raw) : raw;
      });
      return t(rule.key, values);
    }
    return text;
  };
}
