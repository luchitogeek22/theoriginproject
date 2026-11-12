import type { SequenceMode, SequenceRequest } from "./types";

export const DEFAULT_FOV_ARCMIN = 6;
export const FOV_OPTIONS_ARCMIN = [2, 4, 6, 10, 20, 30, 60];
export const DEFAULT_SEQUENCE_MODE = "motion";

/** URL of the sequence view: the single source of truth for what it shows. */
export function sequenceUrl(
  target: { name?: string; ra_deg: number; dec_deg: number; propagated_ra_deg?: number | null; propagated_dec_deg?: number | null },
  fovArcmin = DEFAULT_FOV_ARCMIN,
  mode: string = DEFAULT_SEQUENCE_MODE,
  reference = false
): string {
  const ra = target.propagated_ra_deg ?? target.ra_deg;
  const dec = target.propagated_dec_deg ?? target.dec_deg;
  const params = new URLSearchParams({
    ra: ra.toFixed(6),
    dec: dec.toFixed(6),
    fov: String(fovArcmin),
    mode,
  });
  if (reference) params.set("ref", "1");
  if (target.name) params.set("name", target.name);
  return `/time-explorer?${params.toString()}`;
}

export function nextLargerFov(fovArcmin: number): number | null {
  return FOV_OPTIONS_ARCMIN.find((f) => f > fovArcmin) ?? null;
}

export interface SequenceState {
  ra: number;
  dec: number;
  fov: number;
  mode: SequenceMode;
  detector: number | null;
  reference: boolean;
  name: string;
}

export function parseSequenceState(params: URLSearchParams): SequenceState | null {
  const rawRa = params.get("ra");
  const rawDec = params.get("dec");
  if (!rawRa || !rawDec) return null;
  const ra = Number(rawRa);
  const dec = Number(rawDec);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  if (ra < 0 || ra >= 360 || dec < -90 || dec > 90) return null;
  const rawFov = Number(params.get("fov") ?? DEFAULT_FOV_ARCMIN);
  const fov = Number.isFinite(rawFov) ? Math.min(60, Math.max(1, rawFov)) : DEFAULT_FOV_ARCMIN;
  const mode: SequenceMode = params.get("mode") === "brightness" ? "brightness" : DEFAULT_SEQUENCE_MODE;
  const rawDet = Number(params.get("detector"));
  const detector = Number.isInteger(rawDet) && rawDet >= 1 && rawDet <= 6 ? rawDet : null;
  return {
    ra,
    dec,
    fov,
    mode,
    detector,
    reference: params.get("ref") === "1",
    name: (params.get("name") ?? "").slice(0, 80),
  };
}

/** Free text to resolve with the backend: `q`, or `ra`/`dec` that are not plain numbers. */
export function freeTextQuery(params: URLSearchParams): string | null {
  const q = (params.get("q") ?? "").trim();
  if (q) return q.slice(0, 200);
  const ra = (params.get("ra") ?? "").trim();
  const dec = (params.get("dec") ?? "").trim();
  if (!ra && !dec) return null;
  if (ra && dec && Number.isFinite(Number(ra)) && Number.isFinite(Number(dec))) return null;
  return `${ra} ${dec}`.trim().slice(0, 200);
}

/** Frame index (0-based) from the `frame` parameter, or undefined when absent or invalid. */
export function parseFrameParam(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** Full state of the sequence view as a URL: what "Copiar enlace" and the embed link share. */
export function sequenceStateUrl(state: SequenceState, opts: { frame?: number; embed?: boolean } = {}): string {
  const params = new URLSearchParams({
    ra: state.ra.toFixed(6),
    dec: state.dec.toFixed(6),
    fov: String(state.fov),
    mode: state.mode,
  });
  if (state.detector) params.set("detector", String(state.detector));
  if (state.reference) params.set("ref", "1");
  if (state.name) params.set("name", state.name);
  if (opts.frame !== undefined) params.set("frame", String(opts.frame));
  if (opts.embed) params.set("embed", "1");
  return `/time-explorer?${params.toString()}`;
}

/** Request the time explorer sends for a permanent link, so the server cache matches. */
export function targetSequenceRequest(
  target: { ra_deg: number; dec_deg: number },
  mode: SequenceMode,
  fovArcmin = DEFAULT_FOV_ARCMIN
): SequenceRequest {
  return {
    ra_deg: Number(target.ra_deg.toFixed(6)),
    dec_deg: Number(target.dec_deg.toFixed(6)),
    size_arcmin: fovArcmin,
    mode,
  };
}

export function sequenceJobKey(request: SequenceRequest): string {
  return `sequence|${request.ra_deg.toFixed(6)}|${request.dec_deg.toFixed(6)}|${request.size_arcmin}|${request.mode}|${request.detector ?? ""}|${request.include_reference ? "ref" : ""}`;
}
