import { useFormatter, useTranslations } from "next-intl";
import type { SequenceFrame, SequenceOverlay } from "./types";

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"] as const;

export type CompassKey = (typeof COMPASS)[number];

export interface MotionSummary {
  arcsec: number;
  direction: CompassKey;
  from: string;
  to: string;
  months: number;
}

export function compassDirection(dx: number, dy: number): CompassKey {
  const east = -dx;
  const north = -dy;
  const angle = (Math.atan2(east, north) * 180) / Math.PI;
  return COMPASS[Math.round(((angle + 360) % 360) / 45) % 8];
}

export function motionSummary(overlay: SequenceOverlay | undefined, frames: SequenceFrame[]): MotionSummary | null {
  if (!overlay?.proper_motion_applied || overlay.displacement_arcsec === undefined) return null;
  if (frames.length < 2 || overlay.target.length < 2) return null;
  const first = overlay.target[0];
  const last = overlay.target[overlay.target.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  if (Math.hypot(dx, dy) < 0.05) return null;
  const from = frames[0].date_iso;
  const to = frames[frames.length - 1].date_iso;
  return {
    arcsec: overlay.displacement_arcsec,
    direction: compassDirection(dx, dy),
    from,
    to,
    months: Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 / 30.44),
  };
}

const STAGES = [
  "queued",
  "searching",
  "selecting",
  "downloading",
  "rendering",
  "photometry",
  "reference frame",
  "storing",
  "processing",
] as const;

type StageKey = "queued" | "searching" | "selecting" | "downloading" | "rendering" | "photometry" | "referenceFrame" | "storing" | "processing";

const stageKey = (stage: string): StageKey | null =>
  (STAGES as readonly string[]).includes(stage) ? (stage === "reference frame" ? "referenceFrame" : (stage as StageKey)) : null;

/** Locale-aware labels and formats for motion results and job progress. */
export function useMotionFormat() {
  const t = useTranslations("motion");
  const format = useFormatter();
  return {
    /** Angular displacement with one decimal in the active locale's notation. */
    arcsec: (value: number) => format.number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    /** Observation date (UTC) such as "12 November 2026". */
    date: (iso: string) => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
      return format.dateTime(date, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    },
    direction: (key: CompassKey) => t(`compass.${key}`),
    span: (fromIso: string, toIso: string) => {
      const days = (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000;
      if (!Number.isFinite(days) || days < 0) return "";
      const months = Math.round(days / 30.44);
      if (months < 1) return t("span.days", { count: Math.max(1, Math.round(days)) });
      return t("span.months", { count: months });
    },
    stage: (stage: string | undefined) => {
      if (!stage) return t("stage.sending");
      const key = stageKey(stage);
      return key ? t(`stage.${key}`) : stage;
    },
    progress: (stage: string | undefined, done: number, total: number) => {
      const label = stage ? (stageKey(stage) ? t(`stage.${stageKey(stage)!}`) : stage) : t("stage.sending");
      return total > 0 ? t("progress", { label, done, total }) : label;
    },
  };
}
