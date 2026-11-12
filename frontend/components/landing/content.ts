/**
 * Non-text data of the landing. Every visible text lives in `locales/<locale>/landing.json`
 * under `landing.*` and is looked up by the stable ids below.
 */
export const APP_ENTRY = "/observatory";

export type ChapterId = "origin" | "explore" | "mission" | "epochs" | "objects" | "evidence" | "platform" | "question";

export interface Chapter {
  id: ChapterId;
}

export const CHAPTERS: Chapter[] = [
  { id: "origin" },
  { id: "explore" },
  { id: "mission" },
  { id: "epochs" },
  { id: "objects" },
  { id: "evidence" },
  { id: "platform" },
  { id: "question" },
];

export type Phenomenon = "motion" | "brightness";

export type TargetKey = "barnard" | "epsindi" | "wise0855" | "rwaur" | "rdra";

/** Time span of archive coverage: a calendar range (UTC months) or a duration in days. */
export type CoverageSpan =
  | { kind: "months"; from: [number, number]; to: [number, number] }
  | { kind: "days"; days: number; perDetector: boolean };

export interface ChallengeTarget {
  key: TargetKey;
  /** Catalogue name: never translated. */
  name: string;
  phenomenon: Phenomenon;
  ra: string;
  dec: string;
  raDeg: number;
  decDeg: number;
  exposures: { count: number; approximate: boolean };
  span: CoverageSpan;
  color: string;
}

/** Coordinates and archive coverage come from docs/challenge.md (WP-05 data audit, 2026-11-11). */
export const TARGETS: ChallengeTarget[] = [
  {
    key: "barnard",
    name: "Barnard's Star",
    phenomenon: "motion",
    ra: "17h 57m 48.5s",
    dec: "+04° 41′ 36″",
    raDeg: 269.452,
    decDeg: 4.6933,
    exposures: { count: 195, approximate: false },
    span: { kind: "months", from: [2025, 8], to: [2026, 9] },
    color: "#42D9F5",
  },
  {
    key: "epsindi",
    name: "Epsilon Indi B",
    phenomenon: "motion",
    ra: "22h 04m 10.5s",
    dec: "−56° 46′ 58″",
    raDeg: 331.044,
    decDeg: -56.7828,
    exposures: { count: 249, approximate: false },
    span: { kind: "months", from: [2025, 4], to: [2026, 10] },
    color: "#4263FF",
  },
  {
    key: "wise0855",
    name: "WISE 0855",
    phenomenon: "motion",
    ra: "08h 55m 10.831s",
    dec: "−07° 14′ 42.53″",
    raDeg: 133.795129,
    decDeg: -7.245147,
    exposures: { count: 133, approximate: false },
    span: { kind: "months", from: [2025, 5], to: [2026, 5] },
    color: "#9675FF",
  },
  {
    key: "rwaur",
    name: "RW Aurigae",
    phenomenon: "brightness",
    ra: "05h 07m 49.5s",
    dec: "+30° 24′ 05″",
    raDeg: 76.956,
    decDeg: 30.4014,
    exposures: { count: 171, approximate: false },
    span: { kind: "days", days: 373, perDetector: true },
    color: "#F4F6FC",
  },
  {
    key: "rdra",
    name: "R Draconis",
    phenomenon: "brightness",
    ra: "16h 32m 40.2s",
    dec: "+66° 45′ 18″",
    raDeg: 248.1675,
    decDeg: 66.755,
    exposures: { count: 1300, approximate: true },
    span: { kind: "days", days: 478, perDetector: false },
    color: "#42D9F5",
  },
];

export type ArrayIndex = 1 | 2 | 3 | 4 | 5 | 6;

export interface DetectorArray {
  index: ArrayIndex;
  from: number;
  to: number;
}

/** Six detector arrays × 17 channels = 102 bands, 0.75–5.0 µm (NASA/IPAC IRSA SPHEREx documentation). */
export const DETECTOR_ARRAYS: DetectorArray[] = [
  { index: 1, from: 0.75, to: 1.11 },
  { index: 2, from: 1.11, to: 1.64 },
  { index: 3, from: 1.64, to: 2.42 },
  { index: 4, from: 2.42, to: 3.82 },
  { index: 5, from: 3.82, to: 4.42 },
  { index: 6, from: 4.42, to: 5.0 },
];

/** Each detector array lists two notable features (`landing.bands.arrays.a<index>.<id>`). */
export const ARRAY_FEATURES = ["f1", "f2"] as const;

export const CHANNELS_PER_ARRAY = 17;

export type StepStatus = "available" | "validating";

export type PipelineVisualKind = "region" | "query" | "fits" | "epochs" | "variation" | "journal";

export interface PipelineStep {
  status: StepStatus;
  visual: PipelineVisualKind;
}

/** Status mirrors the compliance matrix in docs/challenge.md: nothing is shown as done before it is verified with real data. */
export const PIPELINE: PipelineStep[] = [
  { status: "available", visual: "region" },
  { status: "validating", visual: "query" },
  { status: "validating", visual: "fits" },
  { status: "validating", visual: "epochs" },
  { status: "validating", visual: "variation" },
  { status: "available", visual: "journal" },
];

export type ModuleKey = "observatory" | "livingSky" | "timeExplorer" | "spectralLab" | "discoveries" | "journal";

export interface ProductModule {
  key: ModuleKey;
  href: string;
}

export const MODULES: ProductModule[] = [
  { key: "observatory", href: "/" },
  { key: "livingSky", href: "/living-sky" },
  { key: "timeExplorer", href: "/time-explorer" },
  { key: "spectralLab", href: "/spectral-lab" },
  { key: "discoveries", href: "/discoveries" },
  { key: "journal", href: "/journal" },
];

export type SourceKey = "irsa" | "jpl" | "spaceApps" | "docs";

export const SOURCES: { key: SourceKey; href: string }[] = [
  { key: "irsa", href: "https://irsa.ipac.caltech.edu/Missions/spherex.html" },
  { key: "jpl", href: "https://www.jpl.nasa.gov/missions/spherex/" },
  { key: "spaceApps", href: "https://www.spaceappschallenge.org/" },
  { key: "docs", href: "https://github.com/luchitogeek22/theoriginproject/tree/main/docs" },
];
