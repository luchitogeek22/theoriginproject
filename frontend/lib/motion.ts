import type { SequenceFrame, SequenceOverlay } from "./types";

const COMPASS = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];

export interface MotionSummary {
  arcsec: number;
  direction: string;
  from: string;
  to: string;
  months: number;
}

export function formatArcsec(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function compassDirection(dx: number, dy: number): string {
  const east = -dx;
  const north = -dy;
  const angle = (Math.atan2(east, north) * 180) / Math.PI;
  return COMPASS[Math.round(((angle + 360) % 360) / 45) % 8];
}

export function spanLabel(fromIso: string, toIso: string): string {
  const days = (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return "";
  const months = Math.round(days / 30.44);
  if (months < 1) return `${Math.max(1, Math.round(days))} ${Math.round(days) === 1 ? "día" : "días"}`;
  return `${months} ${months === 1 ? "mes" : "meses"}`;
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

const STAGE_LABELS: Record<string, string> = {
  queued: "En cola",
  searching: "Buscando observaciones",
  selecting: "Eligiendo visitas",
  downloading: "Descargando cuadros",
  rendering: "Alineando y dibujando",
  photometry: "Midiendo brillo",
  "reference frame": "Buscando el cuadro WISE",
  storing: "Guardando",
  processing: "Procesando cuadros",
};

export function stageLabel(stage: string | undefined): string {
  if (!stage) return "Enviando la petición";
  return STAGE_LABELS[stage] ?? stage;
}

export function progressText(stage: string | undefined, done: number, total: number): string {
  const label = stageLabel(stage);
  return total > 0 ? `${label}: ${done} de ${total}` : label;
}
