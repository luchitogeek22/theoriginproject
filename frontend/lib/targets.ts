/** Validation targets from the project brief. WISE 0855 coordinates are pinned
 * by the specification; the rest resolve through SIMBAD at runtime. */

export interface ValidationTarget {
  key: string;
  name: string;
  hint: string;
  pinned?: { ra_deg: number; dec_deg: number };
}

export const VALIDATION_TARGETS: ValidationTarget[] = [
  { key: "barnard", name: "Barnard's Star", hint: "High proper motion nearby star" },
  { key: "epsindi", name: "Epsilon Indi B", hint: "Brown dwarf companion" },
  {
    key: "wise0855",
    name: "WISE 0855",
    hint: "Coldest known brown dwarf",
    pinned: { ra_deg: 133.795129, dec_deg: -7.245147 },
  },
  { key: "rwaur", name: "RW Aurigae", hint: "Young variable star" },
  { key: "rdra", name: "R Draconis", hint: "Long-period variable" },
];
