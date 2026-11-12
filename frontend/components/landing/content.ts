export const APP_ENTRY = "/";

export interface Chapter {
  id: string;
  label: string;
}

export const CHAPTERS: Chapter[] = [
  { id: "origin", label: "The universe is waiting" },
  { id: "explore", label: "A new way to explore the sky" },
  { id: "mission", label: "The power of SPHEREx" },
  { id: "epochs", label: "The universe is not static" },
  { id: "objects", label: "Objects worth exploring" },
  { id: "evidence", label: "From observation to evidence" },
  { id: "platform", label: "Explore the origin" },
  { id: "question", label: "Every discovery begins with a question" },
];

export type Phenomenon = "motion" | "brightness";

export interface ChallengeTarget {
  key: string;
  name: string;
  kind: string;
  summary: string;
  phenomenon: Phenomenon;
  ra: string;
  dec: string;
  raDeg: number;
  decDeg: number;
  coverage: string;
  span: string;
  note: string;
  color: string;
}

/** Coordinates and archive coverage come from docs/challenge.md (WP-05 data audit, 2026-11-11). */
export const TARGETS: ChallengeTarget[] = [
  {
    key: "barnard",
    name: "Barnard's Star",
    kind: "Red dwarf · high proper motion",
    summary:
      "A red dwarf about 6 light-years away, with the largest proper motion of any known star.",
    phenomenon: "motion",
    ra: "17h 57m 48.5s",
    dec: "+04° 41′ 36″",
    raDeg: 269.452,
    decDeg: 4.6933,
    coverage: "195 exposures",
    span: "Aug 2025 – Sep 2026",
    note: "Expected shift across the span: up to 1.9 SPHEREx pixels.",
    color: "#42D9F5",
  },
  {
    key: "epsindi",
    name: "Epsilon Indi B",
    kind: "Pair of brown dwarfs",
    summary:
      "Two brown dwarfs orbiting each other, both bound to the nearby star Epsilon Indi A.",
    phenomenon: "motion",
    ra: "22h 04m 10.5s",
    dec: "−56° 46′ 58″",
    raDeg: 331.044,
    decDeg: -56.7828,
    coverage: "249 exposures",
    span: "Apr 2025 – Oct 2026",
    note: "Expected shift across the span: up to 1.1 SPHEREx pixels.",
    color: "#4263FF",
  },
  {
    key: "wise0855",
    name: "WISE 0855",
    kind: "Cold, fast-moving brown dwarf",
    summary:
      "The coldest brown dwarf known. Faint in the near-infrared, so a single frame may not show it.",
    phenomenon: "motion",
    ra: "08h 55m 10.831s",
    dec: "−07° 14′ 42.53″",
    raDeg: 133.795129,
    decDeg: -7.245147,
    coverage: "133 exposures",
    span: "May 2025 – May 2026",
    note: "Expected shift across the span: up to 1.35 SPHEREx pixels.",
    color: "#9675FF",
  },
  {
    key: "rwaur",
    name: "RW Aurigae",
    kind: "Young variable star",
    summary:
      "A young star system still surrounded by gas and dust, known for irregular changes in brightness.",
    phenomenon: "brightness",
    ra: "05h 07m 49.5s",
    dec: "+30° 24′ 05″",
    raDeg: 76.956,
    decDeg: 30.4014,
    coverage: "171 exposures",
    span: "373 days per detector",
    note: "Brightness comparisons need one shared intensity scale across frames.",
    color: "#F4F6FC",
  },
  {
    key: "rdra",
    name: "R Draconis",
    kind: "Mira-type long-period variable",
    summary:
      "A pulsating red giant whose brightness rises and falls over a cycle of months.",
    phenomenon: "brightness",
    ra: "16h 32m 40.2s",
    dec: "+66° 45′ 18″",
    raDeg: 248.1675,
    decDeg: 66.755,
    coverage: "≈ 1,300 exposures",
    span: "478 days",
    note: "Spread across three archive collections (qr2, qr2_deep, qr3_deep).",
    color: "#42D9F5",
  },
];

export interface DetectorArray {
  index: number;
  from: number;
  to: number;
  features: string[];
}

/** Six detector arrays × 17 channels = 102 bands, 0.75–5.0 µm (NASA/IPAC IRSA SPHEREx documentation). */
export const DETECTOR_ARRAYS: DetectorArray[] = [
  { index: 1, from: 0.75, to: 1.11, features: ["Starlight from cool stars", "Edge of visible red"] },
  { index: 2, from: 1.11, to: 1.64, features: ["Stellar photospheres", "Galaxy starlight"] },
  { index: 3, from: 1.64, to: 2.42, features: ["Hydrogen Paschen-α line (1.87 µm)", "Dust-obscured stars"] },
  { index: 4, from: 2.42, to: 3.82, features: ["Water ice (≈ 3.0 µm)", "Aromatic dust emission (3.3 µm)"] },
  { index: 5, from: 3.82, to: 4.42, features: ["Hydrogen Brackett-α line (4.05 µm)", "Carbon dioxide ice (4.27 µm)"] },
  { index: 6, from: 4.42, to: 5.0, features: ["Carbon monoxide ice (4.67 µm)", "Cold brown dwarfs glow brightest here"] },
];

export const CHANNELS_PER_ARRAY = 17;

export type StepStatus = "available" | "validating";

export interface PipelineStep {
  title: string;
  detail: string;
  status: StepStatus;
  visual: "region" | "query" | "fits" | "epochs" | "variation" | "journal";
}

/** Status mirrors the compliance matrix in docs/challenge.md: nothing is shown as done before it is verified with real data. */
export const PIPELINE: PipelineStep[] = [
  {
    title: "Select a region of the sky",
    detail: "Search an object by name or type its RA/Dec. The sky view centres on it.",
    status: "available",
    visual: "region",
  },
  {
    title: "Retrieve astronomical observations",
    detail: "The platform asks NASA/IPAC IRSA which SPHEREx exposures cover that point.",
    status: "validating",
    visual: "query",
  },
  {
    title: "Process FITS data",
    detail: "Each exposure is cut around the target and bad pixels are masked. A shared brightness scale across frames is still in development.",
    status: "validating",
    visual: "fits",
  },
  {
    title: "Compare different epochs",
    detail: "Frames from the same band play in order, side by side or blinking, so change is visible to the eye.",
    status: "validating",
    visual: "epochs",
  },
  {
    title: "Analyze possible variations",
    detail: "Aligned differences point to what moved or changed. They assist your eye; they never replace it.",
    status: "validating",
    visual: "variation",
  },
  {
    title: "Generate reproducible evidence",
    detail: "Save the target, query and frames to your journal so anyone can repeat the investigation.",
    status: "available",
    visual: "journal",
  },
];

export interface ProductModule {
  name: string;
  href: string;
  purpose: string;
}

export const MODULES: ProductModule[] = [
  { name: "Observatory", href: "/", purpose: "Start here: a live sky, a search box and the real status of the data sources." },
  { name: "Living Sky", href: "/living-sky", purpose: "Navigate the celestial sphere and see which archive exposures cover each region." },
  { name: "Time Explorer", href: "/time-explorer", purpose: "Step through real epochs, compare A/B frames and run aligned differences." },
  { name: "Spectral Lab", href: "/spectral-lab", purpose: "Measured spectral profiles only. No curve is drawn without real samples." },
  { name: "Discoveries", href: "/discoveries", purpose: "Track possible candidates. Every row links back to its job and observations." },
  { name: "Journal", href: "/journal", purpose: "Save reproducible investigations and export the evidence." },
];

export const SOURCES = [
  { label: "SPHEREx data at NASA/IPAC IRSA", href: "https://irsa.ipac.caltech.edu/Missions/spherex.html" },
  { label: "SPHEREx mission at NASA JPL", href: "https://www.jpl.nasa.gov/missions/spherex/" },
  { label: "NASA Space Apps Challenge", href: "https://www.spaceappschallenge.org/" },
  { label: "Project documentation", href: "https://github.com/luchitogeek22/theoriginproject/tree/main/docs" },
];
