"use client";

import { useTranslateLimitation } from "@/lib/limitations";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Download, Link2, Loader2, Pause, Play, SkipBack, SkipForward, TriangleAlert } from "lucide-react";
import ResultBadge from "@/components/ResultBadge";
import BeforeAfter, { MotionSentence } from "@/components/BeforeAfter";
import DifferenceFrame from "@/components/DifferenceFrame";
import { assetUrl } from "@/lib/api";
import { useMotionFormat } from "@/lib/motion";
import { useErrorText } from "@/lib/errors";
import { useReducedMotion } from "@/lib/useReducedMotion";
import type { SequenceFrame, SequenceResult } from "@/lib/types";
import { nextLargerFov } from "@/lib/sequenceParams";
import { downloadPng, exportSequence, type ExportLabels } from "@/lib/sequenceExport";
import { formatRaDec } from "@/lib/coords";
import { formatSexagesimal, gridFractionToSky, simbadUrl } from "@/lib/gridCoords";

const DISPLAY_DEFAULT = { contrast: 100, brightness: 100, invert: false };

interface Probe {
  fx: number;
  fy: number;
  ra: number;
  dec: number;
}

export const FLAGGED_WARNING_THRESHOLD = 0.3;
const SCALE_GRADIENT = "linear-gradient(to right, #000, #fff)";

const SPEEDS = [
  { factor: 0.5, ms: 1600 },
  { factor: 1, ms: 800 },
  { factor: 2, ms: 400 },
  { factor: 4, ms: 200 },
];

function frameUrl(f: SequenceFrame): string {
  return assetUrl(f.png_url);
}

interface PreloadState {
  loaded: number;
  failed: number;
  done: boolean;
}

function usePreload(frames: SequenceFrame[]): PreloadState {
  const [state, setState] = useState<PreloadState>({ loaded: 0, failed: 0, done: false });
  const keep = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    let cancelled = false;
    let loaded = 0;
    let failed = 0;
    setState({ loaded: 0, failed: 0, done: frames.length === 0 });
    keep.current = frames.map((f) => {
      const img = new Image();
      img.src = frameUrl(f);
      img
        .decode()
        .then(() => {
          loaded += 1;
        })
        .catch(() => {
          failed += 1;
        })
        .finally(() => {
          if (cancelled) return;
          setState({ loaded, failed, done: loaded + failed === frames.length });
        });
      return img;
    });
    return () => {
      cancelled = true;
    };
  }, [frames]);

  return state;
}


async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

function HelpText({ children }: { children: React.ReactNode }) {
  return <span className="mt-0.5 block text-[10px] leading-snug text-mutedstar/80">{children}</span>;
}

interface SequencePlayerProps {
  result: SequenceResult;
  fovArcmin?: number;
  onFovChange?: (fovArcmin: number) => void;
  initialFrame?: number;
  shareUrl?: (frame: number) => string;
  exportName?: string;
}

export default function SequencePlayer({
  result,
  fovArcmin,
  onFovChange,
  initialFrame,
  shareUrl,
  exportName: exportNameProp,
}: SequencePlayerProps) {
  const t = useTranslations("sequencePlayer");
  const tExport = useTranslations("export");
  const format = useFormatter();
  const motion = useMotionFormat();
  const errorText = useErrorText();
  const translateLimitation = useTranslateLimitation();
  const exportName = exportNameProp ?? t("defaultExportName");
  const exportLabels: ExportLabels = {
    attribution: tExport("attribution"),
    noWavelength: tExport("noWavelength"),
    frameFile: tExport("frameFile"),
  };
  const pct = (value: number) =>
    format.number(value, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const cacheNotice = (): string => {
    const queried = result.queried_at ? new Date(result.queried_at) : null;
    if (queried && !Number.isNaN(queried.getTime())) {
      return t("cache.queried", { date: format.dateTime(queried, { dateStyle: "long", timeStyle: "short" }) });
    }
    return result.cache_label || t("cache.fallback");
  };
  const { frames, scale, grid, overlay, reference } = result;
  const total = frames.length;
  const preload = usePreload(frames);
  const reducedMotion = useReducedMotion();

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(800);
  const [blink, setBlink] = useState(false);
  const [blinkA, setBlinkA] = useState(0);
  const [blinkB, setBlinkB] = useState(Math.max(0, total - 1));
  const [blinkPhase, setBlinkPhase] = useState(false);
  const [showGaia, setShowGaia] = useState(false);
  const [showTrack, setShowTrack] = useState(result.overlay?.proper_motion_applied === true);
  const [smooth, setSmooth] = useState(result.mode === "motion");
  const [view, setView] = useState<"sequence" | "compare">("sequence");
  const [showReference, setShowReference] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [display, setDisplay] = useState(DISPLAY_DEFAULT);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [difference, setDifference] = useState(false);
  const [probeMessage, setProbeMessage] = useState("");
  const firstFrames = useRef(frames);

  const usable = preload.done && preload.loaded > 0;
  const canAnimate = usable && total > 1;

  useEffect(() => {
    const restore = frames === firstFrames.current && initialFrame !== undefined;
    setIndex(restore ? Math.min(initialFrame, Math.max(0, total - 1)) : 0);
    setBlinkA(0);
    setBlinkB(Math.max(0, total - 1));
    setBlinkPhase(false);
    setBlink(false);
    setPlaying(false);
    setProbe(null);
    setProbeMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, total]);

  useEffect(() => {
    if (canAnimate && !reducedMotion && initialFrame === undefined) setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAnimate, reducedMotion, frames]);

  useEffect(() => {
    if (!playing || !canAnimate) return;
    const id = window.setInterval(() => {
      if (blink) setBlinkPhase((p) => !p);
      else setIndex((i) => (i + 1) % total);
    }, speedMs);
    return () => window.clearInterval(id);
  }, [playing, canAnimate, blink, speedMs, total]);

  useEffect(() => {
    const onHidden = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  const shownIndex = blink ? (blinkPhase ? blinkB : blinkA) : index;
  const frame = frames[Math.min(shownIndex, total - 1)];
  const referenceFrame = frames[Math.min(blinkA, total - 1)];
  const showDifference = difference && total > 1;

  const step = useCallback(
    (delta: number) => {
      setPlaying(false);
      setBlink(false);
      setIndex((i) => (i + delta + total) % total);
    },
    [total]
  );

  const copyLink = async () => {
    if (!shareUrl) return;
    const url = `${window.location.origin}${shareUrl(index)}`;
    setShareMessage((await copyText(url)) ? t("share.copied") : t("share.failed", { url }));
  };

  const markPosition = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const fx = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const fy = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    setProbe({ fx, fy, ...gridFractionToSky(result.grid, fx, fy) });
    setProbeMessage("");
  };

  const copyProbe = async () => {
    if (!probe) return;
    const text = `${probe.ra.toFixed(6)} ${probe.dec >= 0 ? "+" : ""}${probe.dec.toFixed(6)}`;
    setProbeMessage((await copyText(text)) ? t("probe.copied") : t("share.failed", { url: text }));
  };

  const exportMessageFor = (e: unknown) => errorText(e, t("export.failed"));

  const exportPng = async () => {
    setExporting(true);
    setExportMessage(t("export.preparingFrame"));
    try {
      await downloadPng(frames[Math.min(index, total - 1)], total, exportName, exportLabels);
      setExportMessage(t("export.frameDownloaded"));
    } catch (e) {
      setExportMessage(exportMessageFor(e));
    } finally {
      setExporting(false);
    }
  };

  const exportVideo = async () => {
    setPlaying(false);
    setExporting(true);
    setExportMessage(t("export.loadingFrames"));
    try {
      const path = await exportSequence(frames, exportName, exportLabels, (done, all, phase) =>
        setExportMessage(
          phase === "loading"
            ? t("export.loadingProgress", { done, total: all })
            : phase === "recording"
              ? t("export.recordingProgress", { done, total: all })
              : t("export.pngProgress", { done, total: all })
        )
      );
      setExportMessage(
        path === "webm" ? t("export.webmDone", { count: total }) : t("export.pngFallback", { count: total })
      );
    } catch (e) {
      setExportMessage(exportMessageFor(e));
    } finally {
      setExporting(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (!canAnimate || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.key === " " && tag !== "BUTTON" && tag !== "INPUT") {
      e.preventDefault();
      setPlaying((p) => !p);
    } else if (e.key === "ArrowRight" && tag !== "INPUT") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft" && tag !== "INPUT") {
      e.preventDefault();
      step(-1);
    }
  };

  if (total === 0 || !frame) return null;

  const flaggedHigh = frame.flagged_fraction >= FLAGGED_WARNING_THRESHOLD;
  const motionMode = result.mode === "motion";
  const gaiaEnabled = overlay?.gaia_available !== false;
  const biggerFov = fovArcmin !== undefined ? nextLargerFov(fovArcmin) : null;
  const size = grid.size_px;
  const frameIndex = Math.min(shownIndex, total - 1);
  const targetNow = overlay?.target.find((p) => p.index === frameIndex);
  const targetFirst = overlay?.target[0];
  const targetLast = overlay?.target[overlay.target.length - 1];
  const trailSpan = motion.span(frames[0].date_iso, frames[total - 1].date_iso);
  const trailArcsec = overlay?.displacement_arcsec !== undefined ? motion.arcsec(overlay.displacement_arcsec) : "";
  const trailLabel =
    overlay?.proper_motion_applied && overlay.displacement_arcsec !== undefined && total > 1
      ? trailSpan
        ? t("trailWithSpan", { arcsec: trailArcsec, span: trailSpan })
        : `${trailArcsec}″`
      : null;
  const overlayVisible = overlay !== undefined && ((showGaia && gaiaEnabled) || showTrack);
  const displayChanged =
    display.contrast !== DISPLAY_DEFAULT.contrast ||
    display.brightness !== DISPLAY_DEFAULT.brightness ||
    display.invert !== DISPLAY_DEFAULT.invert;
  // Display-only: the same CSS filter applies to every frame, so comparisons between frames hold.
  const displayFilter = displayChanged
    ? `contrast(${display.contrast}%) brightness(${display.brightness}%)${display.invert ? " invert(1)" : ""}`
    : undefined;

  return (
    <div
      className="grid gap-3 outline-none lg:grid-cols-[minmax(0,1fr)_280px]"
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="group"
      aria-label={t("playerLabel")}
    >
      <div className="min-w-0">
        <MotionSentence result={result} />
        {result.served_from_cache && (
          <p
            role="status"
            className="mx-auto mb-2 max-w-[560px] rounded border border-gold/60 bg-deep p-2 text-xs font-semibold text-gold"
          >
            {t("cache.notice", { notice: cacheNotice() })}
          </p>
        )}
        <div className="mx-auto mb-1 max-w-[560px]">
          <ResultBadge kind="observation" />
        </div>
        {total > 1 && (
          <div className="mx-auto mb-2 flex max-w-[560px] flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-mutedstar">
            <div className="flex rounded border border-line bg-deep p-0.5" role="group" aria-label={t("view.label")}>
              {(
                [
                  ["sequence", t("view.sequence")],
                  ["compare", t("view.compare")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  data-testid={`view-${value}`}
                  onClick={() => {
                    setView(value);
                    if (value === "compare") setPlaying(false);
                  }}
                  className={`rounded px-2.5 py-1 text-xs ${
                    view === value ? "bg-panel text-pulse" : "text-mutedstar hover:text-starlight"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {view === "sequence" && (
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={smooth}
                  onChange={(e) => setSmooth(e.target.checked)}
                  data-testid="smooth-toggle"
                />
                {t("smooth")}
              </label>
            )}
          </div>
        )}
        {view === "compare" && total > 1 && <BeforeAfter result={result} />}
        <div className={`${showReference && reference ? "grid gap-2 sm:grid-cols-2" : ""} ${view === "compare" && total > 1 ? "hidden" : ""}`}>
        <div
          className="relative mx-auto aspect-square w-full max-w-[560px] cursor-crosshair overflow-hidden rounded border border-line bg-abyss"
          onClick={markPosition}
          data-testid="frame-canvas"
        >
          {showDifference ? (
            <DifferenceFrame
              frames={frames}
              frame={frame}
              reference={referenceFrame}
              smooth={smooth}
              alt={t("difference.alt", { number: frame.index + 1, reference: referenceFrame.index + 1 })}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={frameUrl(frame)}
              alt={t("frameAlt", { number: frame.index + 1, total, date: frame.date_iso, detector: frame.detector })}
              className="h-full w-full"
              style={{ imageRendering: smooth ? "auto" : "pixelated", filter: displayFilter }}
              draggable={false}
            />
          )}
          {probe && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
              data-testid="probe-marker"
            >
              <path
                d={`M ${probe.fx * 100 - 4} ${probe.fy * 100} L ${probe.fx * 100 - 1.5} ${probe.fy * 100} M ${probe.fx * 100 + 1.5} ${probe.fy * 100} L ${probe.fx * 100 + 4} ${probe.fy * 100} M ${probe.fx * 100} ${probe.fy * 100 - 4} L ${probe.fx * 100} ${probe.fy * 100 - 1.5} M ${probe.fx * 100} ${probe.fy * 100 + 1.5} L ${probe.fx * 100} ${probe.fy * 100 + 4}`}
                stroke="#7CFFB2"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          {overlayVisible && overlay && (
            <svg
              viewBox={`0 0 ${size} ${size}`}
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              {showGaia &&
                gaiaEnabled &&
                overlay.gaia.map((star) => {
                  const pos = star.positions.find((p) => p.index === frameIndex);
                  return pos ? (
                    <circle
                      key={star.source_id}
                      cx={pos.x}
                      cy={pos.y}
                      r={Math.max(2.5, size * 0.012)}
                      fill="none"
                      stroke="#c8a45c"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null;
                })}
              {showTrack && targetFirst && targetLast && targetFirst !== targetLast && (
                <>
                  <polyline
                    points={overlay.target.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke="#46d8ff"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={targetFirst.x}
                    cy={targetFirst.y}
                    r={Math.max(0.9, size * 0.014)}
                    fill="none"
                    stroke="#46d8ff"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d={`M ${targetLast.x - 1.1} ${targetLast.y} L ${targetLast.x + 1.1} ${targetLast.y} M ${targetLast.x} ${targetLast.y - 1.1} L ${targetLast.x} ${targetLast.y + 1.1}`}
                    stroke="#ffb64a"
                    strokeWidth={1.8}
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
              {showTrack && targetNow && (
                <circle
                  cx={targetNow.x}
                  cy={targetNow.y}
                  r={Math.max(overlay.uncertainty_px, 1.6)}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity={0.85}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
          )}
          {!usable && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-abyss/80 text-xs text-mutedstar">
              {preload.done ? (
                <p className="px-4 text-center text-red-300">
                  {t("loadFailed")}
                </p>
              ) : (
                <>
                  <Loader2 size={18} className="animate-spin text-pulse" />
                  <p>{t("decoding", { done: preload.loaded + preload.failed, total })}</p>
                </>
              )}
            </div>
          )}
          <div className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-abyss/80 px-1.5 py-0.5 text-[11px] text-starlight">
            {shownIndex + 1} / {total}
          </div>
          <div className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-abyss/80 px-1.5 py-0.5 text-[10px] text-mutedstar">
            {t("orientation")}
          </div>
          {showTrack && trailLabel && (
            <div
              className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-abyss/80 px-1.5 py-0.5 text-[11px] font-semibold text-pulse"
              data-testid="trajectory-label"
            >
              {trailLabel}
            </div>
          )}
        </div>
        {showReference && reference && (
          <figure className="mx-auto w-full max-w-[560px]">
            <div className="aspect-square overflow-hidden rounded border border-gold/60 bg-abyss">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl(reference.png_url)}
                alt={t("reference.alt", { band: reference.band, epoch: reference.epoch_iso })}
                className="h-full w-full"
                draggable={false}
              />
            </div>
            <figcaption className="mt-1 text-[10px] leading-snug text-gold">
              {t("reference.caption", {
                label: reference.label,
                band: reference.band,
                epoch: reference.epoch_iso || t("reference.notAvailable"),
              })}
            </figcaption>
          </figure>
        )}
        </div>
        {overlay && (
          <fieldset className="mx-auto mt-2 max-w-[560px] rounded border border-line bg-deep p-2 text-[11px] text-mutedstar">
            <legend className="px-1 font-semibold text-starlight">{t("layers.legend")}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <label className={`flex items-center gap-1 ${gaiaEnabled ? "" : "opacity-60"}`}>
                <input
                  type="checkbox"
                  checked={showGaia && gaiaEnabled}
                  disabled={!gaiaEnabled}
                  onChange={(e) => setShowGaia(e.target.checked)}
                />
                {t("layers.gaia")}
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={showTrack}
                  onChange={(e) => setShowTrack(e.target.checked)}
                  data-testid="trajectory-toggle"
                />
                {t("layers.trajectory")}
              </label>
              {reference && (
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={showReference}
                    onChange={(e) => setShowReference(e.target.checked)}
                  />
                  {t("layers.wiseReference")}
                </label>
              )}
            </div>
            {!gaiaEnabled && overlay.gaia_warning && <p className="mt-1 text-gold">{overlay.gaia_warning}</p>}
            {showTrack && (
              <p className="mt-1">
                {overlay.proper_motion_applied
                  ? t("track.known", {
                      detail:
                        overlay.displacement_arcsec !== undefined
                          ? t("track.displacement", { arcsec: motion.arcsec(overlay.displacement_arcsec) })
                          : "",
                    })
                  : t("track.fixed")}
              </p>
            )}
            {overlay.fov_hint && (
              <p className="mt-1 text-gold" role="status">
                {t("suggestion", { hint: overlay.fov_hint })}
                {biggerFov !== null && onFovChange && (
                  <button
                    type="button"
                    onClick={() => onFovChange(biggerFov)}
                    className="ml-2 rounded border border-gold/60 px-2 py-0.5 text-starlight hover:border-pulse"
                  >
                    {t("useFov", { fov: biggerFov })}
                  </button>
                )}
              </p>
            )}
          </fieldset>
        )}
        <div
          className="mx-auto mt-2 max-w-[560px] rounded border border-line bg-deep p-2 text-[11px] text-mutedstar"
          data-testid="probe-panel"
        >
          {probe ? (
            <>
              <p className="font-semibold text-starlight">{t("probe.label")}</p>
              <p className="mt-0.5 font-mono text-starlight" data-testid="probe-coords">
                {formatRaDec(probe.ra, probe.dec)} · {formatSexagesimal(probe.ra, probe.dec)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <a
                  href={simbadUrl(probe.ra, probe.dec)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-line px-2 py-0.5 text-starlight hover:border-pulse"
                >
                  {t("probe.simbad")}
                </a>
                <button
                  type="button"
                  onClick={() => void copyProbe()}
                  className="rounded border border-line px-2 py-0.5 text-starlight hover:border-pulse"
                >
                  {t("probe.copy")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProbe(null);
                    setProbeMessage("");
                  }}
                  className="rounded border border-line px-2 py-0.5 hover:text-starlight"
                >
                  {t("probe.clear")}
                </button>
                <span aria-live="polite">{probeMessage}</span>
              </div>
              <HelpText>{t("probe.precision")}</HelpText>
            </>
          ) : (
            <p>{t("probe.hint")}</p>
          )}
        </div>

        <fieldset className="mx-auto mt-2 max-w-[560px] rounded border border-line bg-deep p-2 text-[11px] text-mutedstar">
          <legend className="px-1 font-semibold text-starlight">{t("display.legend")}</legend>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <label className="flex items-center gap-1">
              {t("display.contrast")}
              <input
                type="range"
                min={50}
                max={400}
                step={10}
                value={display.contrast}
                onChange={(e) => setDisplay((d) => ({ ...d, contrast: Number(e.target.value) }))}
                className="w-24 accent-[#46d8ff]"
                data-testid="display-contrast"
              />
              <span className="w-9 tabular-nums">{display.contrast}%</span>
            </label>
            <label className="flex items-center gap-1">
              {t("display.brightness")}
              <input
                type="range"
                min={30}
                max={300}
                step={10}
                value={display.brightness}
                onChange={(e) => setDisplay((d) => ({ ...d, brightness: Number(e.target.value) }))}
                className="w-24 accent-[#46d8ff]"
                data-testid="display-brightness"
              />
              <span className="w-9 tabular-nums">{display.brightness}%</span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={display.invert}
                onChange={(e) => setDisplay((d) => ({ ...d, invert: e.target.checked }))}
                data-testid="display-invert"
              />
              {t("display.invert")}
            </label>
            <button
              type="button"
              onClick={() => setDisplay(DISPLAY_DEFAULT)}
              disabled={!displayChanged}
              className="rounded border border-line px-2 py-0.5 hover:text-starlight disabled:opacity-40"
            >
              {t("display.reset")}
            </button>
          </div>
          <HelpText>{t("display.help")}</HelpText>
        </fieldset>

        {preload.failed > 0 && preload.done && preload.loaded > 0 && (
          <p className="mt-1 text-[11px] text-gold">
            {t("framesFailed", { failed: preload.failed, total })}
          </p>
        )}

        {total === 1 ? (
          <p className="mt-2 rounded border border-line bg-deep p-2 text-xs text-mutedstar">
            {t("singleEpoch")}
          </p>
        ) : (
          <div className="mx-auto mt-2 max-w-[560px]">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-mutedstar">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={!canAnimate}
                aria-label={t("controls.previous")}
                className="rounded border border-line p-1.5 hover:text-starlight disabled:opacity-40"
              >
                <SkipBack size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                disabled={!canAnimate}
                aria-label={playing ? t("controls.pause") : t("controls.play")}
                className="flex items-center gap-1 rounded bg-pulse px-3 py-1.5 font-bold text-starlight hover:brightness-110 disabled:opacity-40"
              >
                {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? t("controls.pause") : t("controls.play")}
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={!canAnimate}
                aria-label={t("controls.next")}
                className="rounded border border-line p-1.5 hover:text-starlight disabled:opacity-40"
              >
                <SkipForward size={14} />
              </button>
              <label className="ml-auto flex items-center gap-1">
                {t("controls.speed")}
                <select
                  value={speedMs}
                  onChange={(e) => setSpeedMs(Number(e.target.value))}
                  className="rounded border border-line bg-deep px-1 py-0.5"
                >
                  {SPEEDS.map((s) => (
                    <option key={s.ms} value={s.ms}>
                      {`${format.number(s.factor)}×`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <input
              type="range"
              min={0}
              max={total - 1}
              value={index}
              disabled={!canAnimate}
              onChange={(e) => {
                setPlaying(false);
                setBlink(false);
                setIndex(Number(e.target.value));
              }}
              aria-label={t("controls.position")}
              className="mt-2 w-full accent-[#46d8ff]"
            />
            {reducedMotion && (
              <p className="mt-1 text-[10px] text-mutedstar/80">
                {t("controls.reducedMotion")}
              </p>
            )}

            <fieldset className="mt-2 rounded border border-line bg-deep p-2 text-[11px] text-mutedstar">
              <legend className="px-1 font-semibold text-starlight">{t("blink.legend")}</legend>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1">
                  A
                  <select
                    value={blinkA}
                    onChange={(e) => setBlinkA(Number(e.target.value))}
                    className="rounded border border-line bg-abyss px-1 py-0.5"
                  >
                    {frames.map((f) => (
                      <option key={f.index} value={f.index}>
                        {f.index + 1} · {f.date_iso}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  B
                  <select
                    value={blinkB}
                    onChange={(e) => setBlinkB(Number(e.target.value))}
                    className="rounded border border-line bg-abyss px-1 py-0.5"
                  >
                    {frames.map((f) => (
                      <option key={f.index} value={f.index}>
                        {f.index + 1} · {f.date_iso}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  aria-pressed={blink}
                  disabled={!canAnimate}
                  onClick={() => {
                    setBlink((b) => !b);
                    setBlinkPhase(false);
                    if (!blink && !reducedMotion) setPlaying(true);
                  }}
                  className={`rounded border px-2 py-1 ${blink ? "border-pulse text-pulse" : "border-line"} disabled:opacity-40`}
                >
                  {blink ? t("blink.stop") : t("blink.start")}
                </button>
                <button
                  type="button"
                  aria-pressed={difference}
                  onClick={() => setDifference((d) => !d)}
                  className={`rounded border px-2 py-1 ${difference ? "border-pulse text-pulse" : "border-line"}`}
                  data-testid="difference-toggle"
                >
                  {difference ? t("difference.stop") : t("difference.start")}
                </button>
              </div>
              {difference && (
                <p className="mt-1" data-testid="difference-legend">
                  {t("difference.legend", { reference: referenceFrame.index + 1 })}
                </p>
              )}
            </fieldset>
          </div>
        )}

        <div className="mx-auto mt-2 max-w-[560px] rounded border border-line bg-deep p-2 text-[11px] text-mutedstar">
          <div className="flex flex-wrap items-center gap-1.5">
            {shareUrl && (
              <button
                type="button"
                onClick={() => void copyLink()}
                className="flex items-center gap-1 rounded border border-line px-2 py-1 text-starlight hover:border-pulse"
              >
                <Link2 size={13} /> {t("actions.copyLink")}
              </button>
            )}
            <button
              type="button"
              onClick={() => void exportPng()}
              disabled={!usable || exporting}
              className="flex items-center gap-1 rounded border border-line px-2 py-1 text-starlight hover:border-pulse disabled:opacity-40"
            >
              <Download size={13} /> {t("actions.downloadPng")}
            </button>
            {total > 1 && (
              <button
                type="button"
                onClick={() => void exportVideo()}
                disabled={!usable || exporting}
                className="flex items-center gap-1 rounded border border-line px-2 py-1 text-starlight hover:border-pulse disabled:opacity-40"
              >
                <Download size={13} /> {t("actions.exportVideo")}
              </button>
            )}
          </div>
          <p aria-live="polite" className="mt-1 break-all">
            {shareMessage} {exportMessage}
          </p>
        </div>

        <div className="mx-auto mt-3 max-w-[560px]">
          <div className="h-2.5 w-full rounded border border-line" style={{ background: SCALE_GRADIENT }} aria-hidden="true" />
          <div className="mt-0.5 flex justify-between text-[10px] text-mutedstar">
            <span>
              {scale.lo.toPrecision(3)} {scale.unit}
            </span>
            <span>
              {scale.hi.toPrecision(3)} {scale.unit}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-gold">
            {result.mode === "motion" || result.mode === "brightness"
              ? t(`modeHelp.${result.mode}`)
              : t("modeHelp.other", { mode: result.mode })}
          </p>
        </div>
      </div>

      <aside className="flex flex-col gap-2 text-[11px]" aria-label={t("meta.label")}>
        <div className="rounded border border-line bg-deep p-2">
          <p className="text-xs font-semibold text-starlight">{t("meta.frame", { number: shownIndex + 1, total })}</p>
          <dl className="mt-1 flex flex-col gap-1.5 text-mutedstar">
            <div>
              <dt className="font-semibold text-starlight">{t("meta.date")}</dt>
              <dd>{frame.date_iso}</dd>
            </div>
            <div>
              <dt className="font-semibold text-starlight">{t("meta.detector")}</dt>
              <dd>{frame.detector}</dd>
              <HelpText>{t("fieldHelp.detector")}</HelpText>
            </div>
            <div>
              <dt className="font-semibold text-starlight">{t("meta.wavelength")}</dt>
              <dd>
                {frame.wavelength_um === null
                  ? t("reference.notAvailable")
                  : t("meta.wavelengthValue", {
                      value: format.number(frame.wavelength_um, { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
                    })}
              </dd>
              <HelpText>{t("fieldHelp.wavelength")}</HelpText>
            </div>
            <div>
              <dt className="font-semibold text-starlight">{t("meta.flagged")}</dt>
              <dd className={flaggedHigh ? "font-semibold text-gold" : ""}>{pct(frame.flagged_fraction)}</dd>
              <HelpText>{t("fieldHelp.flagged")}</HelpText>
            </div>
            <div>
              <dt className="font-semibold text-starlight">{t("meta.coverage")}</dt>
              <dd>{pct(frame.coverage_fraction)}</dd>
              <HelpText>{t("fieldHelp.coverage")}</HelpText>
            </div>
            <div>
              <dt className="font-semibold text-starlight">{t("meta.collection")}</dt>
              <dd>{frame.collection}</dd>
              <HelpText>{t("fieldHelp.collection")}</HelpText>
            </div>
            <div>
              <dt className="font-semibold text-starlight">{t("meta.identifier")}</dt>
              <dd className="break-all">{frame.obs_id}</dd>
            </div>
          </dl>
          {flaggedHigh && (
            <p
              role="alert"
              className="mt-2 flex items-start gap-1 rounded border border-gold/60 bg-abyss p-1.5 text-gold"
            >
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              <span>
                {t("meta.flaggedWarning", {
                  percent: pct(frame.flagged_fraction),
                  threshold: format.number(FLAGGED_WARNING_THRESHOLD, { style: "percent", maximumFractionDigits: 0 }),
                })}
              </span>
            </p>
          )}
        </div>

        <div className="rounded border border-line bg-deep p-2 text-mutedstar">
          <p className="font-semibold text-starlight">{t("grid.title")}</p>
          <p className="mt-0.5">
            {t("grid.summary", {
              size: grid.size_px,
              scale: format.number(grid.pixel_scale_arcsec, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              orientation: grid.orientation === "north up, east left" ? t("grid.northUp") : grid.orientation,
            })}
          </p>
          <p className="mt-0.5">
            {result.n_used < result.n_available
              ? t("grid.framesUsedLimited", { used: result.n_used, available: result.n_available })
              : t("grid.framesUsed", { used: result.n_used, available: result.n_available })}
          </p>
          <p className="mt-0.5 text-mutedstar/70">{t("grid.processingVersion", { version: result.processing_version })}</p>
          {motionMode && (
            <p className="mt-1 text-gold">
              {t("grid.notMeasurement")}
            </p>
          )}
        </div>

        {result.limitations.length > 0 && (
          <div className="rounded border border-line bg-deep p-2">
            <p className="flex items-center gap-1 font-semibold text-gold">
              <TriangleAlert size={12} /> {t("limitations")}
            </p>
            <ul className="mt-0.5 flex flex-col gap-0.5 text-mutedstar">
              {result.limitations.map((l, i) => (
                <li key={i}>· {translateLimitation(l)}</li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
