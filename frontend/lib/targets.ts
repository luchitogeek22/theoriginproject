/** Validation targets from the challenge. The backend resolves them offline. */

import type { SequenceMode } from "./types";

export interface ValidationTarget {
  key: string;
  name: string;
  hint: string;
  ra_deg: number;
  dec_deg: number;
  mode: SequenceMode;
  hook: string;
}

export const VALIDATION_TARGETS: ValidationTarget[] = [
  {
    key: "barnard",
    name: "Barnard's Star",
    hint: "High proper motion nearby star",
    ra_deg: 269.4520769586187,
    dec_deg: 4.693364966576667,
    mode: "motion",
    hook: "Mira cómo se mueve la estrella de Barnard",
  },
  {
    key: "epsindi",
    name: "Epsilon Indi B",
    hint: "Brown dwarf companion",
    ra_deg: 331.04414658852124,
    dec_deg: -56.782844195116105,
    mode: "motion",
    hook: "Mira Epsilon Indi B, dos enanas marrones junto a una estrella",
  },
  {
    key: "wise0855",
    name: "WISE 0855",
    hint: "Coldest known brown dwarf",
    ra_deg: 133.81890825,
    dec_deg: -7.247048,
    mode: "motion",
    hook: "Mira WISE 0855, la enana marrón más fría",
  },
  {
    key: "rwaur",
    name: "RW Aurigae",
    hint: "Young variable star",
    ra_deg: 76.95652603458333,
    dec_deg: 30.401438173888888,
    mode: "brightness",
    hook: "Mira RW Aurigae, una estrella joven que cambia de brillo",
  },
  {
    key: "rdra",
    name: "R Draconis",
    hint: "Long-period variable",
    ra_deg: 248.16761083295,
    dec_deg: 66.75497941722,
    mode: "brightness",
    hook: "Mira cómo late R Draconis",
  },
];
