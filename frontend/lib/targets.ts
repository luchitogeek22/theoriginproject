/** Validation targets from the challenge. The backend resolves them offline. */

import { useTranslations } from "next-intl";
import type { SequenceMode } from "./types";

export type TargetKey = "barnard" | "epsindi" | "wise0855" | "rwaur" | "rdra";

export interface ValidationTarget {
  key: TargetKey;
  /** Official catalogue name; never translated. */
  name: string;
  ra_deg: number;
  dec_deg: number;
  mode: SequenceMode;
}

export const VALIDATION_TARGETS: ValidationTarget[] = [
  {
    key: "barnard",
    name: "Barnard's Star",
    ra_deg: 269.4520769586187,
    dec_deg: 4.693364966576667,
    mode: "motion",
  },
  {
    key: "epsindi",
    name: "Epsilon Indi B",
    ra_deg: 331.04414658852124,
    dec_deg: -56.782844195116105,
    mode: "motion",
  },
  {
    key: "wise0855",
    name: "WISE 0855",
    ra_deg: 133.81890825,
    dec_deg: -7.247048,
    mode: "motion",
  },
  {
    key: "rwaur",
    name: "RW Aurigae",
    ra_deg: 76.95652603458333,
    dec_deg: 30.401438173888888,
    mode: "brightness",
  },
  {
    key: "rdra",
    name: "R Draconis",
    ra_deg: 248.16761083295,
    dec_deg: 66.75497941722,
    mode: "brightness",
  },
];

/** Translated short description (`hint`) and call to action (`hook`) of a validation target. */
export function useTargetCopy(): (key: TargetKey) => { hint: string; hook: string } {
  const t = useTranslations("targets");
  return (key) => ({ hint: t(`${key}.hint`), hook: t(`${key}.hook`) });
}
