"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Link2, Loader2, Pause, Play, SkipBack, SkipForward, TriangleAlert } from "lucide-react";
import ResultBadge from "@/components/ResultBadge";
import { assetUrl } from "@/lib/api";
import type { SequenceFrame, SequenceResult } from "@/lib/types";
import { nextLargerFov } from "@/lib/sequenceParams";
import { ExportError, downloadPng, exportSequence } from "@/lib/sequenceExport";

export const FLAGGED_WARNING_THRESHOLD = 0.3;
const SCALE_GRADIENT = "linear-gradient(to right, #000, #fff)";

const SPEEDS = [
  { label: "0,5×", ms: 1600 },
  { label: "1×", ms: 800 },
  { label: "2×", ms: 400 },
  { label: "4×", ms: 200 },
];

const MODE_HELP: Record<string, string> = {
  motion:
    "Modo movimiento: cada cuadro se normaliza con su propio ruido (unidades de ruido por cuadro). Sirve para ver desplazamientos, pero el brillo NO es comparable entre cuadros.",
  brightness:
    "Modo brillo: todos los cuadros comparten la misma escala lineal, por lo que el brillo sí es comparable entre épocas.",
};

const FIELD_HELP = {
  flagged:
    "Fracción de píxeles marcados por el archivo como poco fiables (rayos cósmicos, saturación, píxeles muertos). Cuanto mayor, menos confiable es el cuadro.",
  coverage:
    "Fracción del recorte cubierta por datos reales de esta exposición. Si es baja, parte de la imagen está vacía.",
  collection: "Colección del archivo IRSA de la que procede la exposición.",
  wavelength:
    "Longitud de onda efectiva en el centro del recorte. SPHEREx observa con un filtro variable: cada exposición cubre un rango distinto.",
  detector:
    "Detector de SPHEREx que registró el cuadro. Todos los cuadros de una secuencia comparten detector para que sean comparables.",
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1).replace(".", ",")} %`;
}

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

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function cacheNotice(result: SequenceResult): string {
  const queried = result.queried_at ? new Date(result.queried_at) : null;
  if (queried && !Number.isNaN(queried.getTime())) {
    return `Consultado el ${queried.toLocaleString("es", { dateStyle: "long", timeStyle: "short" })}, desde caché`;
  }
  return result.cache_label || "Resultado servido desde caché";
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
  exportName = "secuencia",
}: SequencePlayerProps) {
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
  const [showTrack, setShowTrack] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [exporting, setExporting] = useState(false);
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
    setShareMessage((await copyText(url)) ? "Enlace copiado al portapapeles." : `No se pudo copiar. Copia este enlace a mano: ${url}`);
  };

  const exportMessageFor = (e: unknown) =>
    e instanceof ExportError ? e.message : "La exportación falló. Inténtalo de nuevo.";

  const exportPng = async () => {
    setExporting(true);
    setExportMessage("Preparando el cuadro…");
    try {
      await downloadPng(frames[Math.min(index, total - 1)], total, exportName);
      setExportMessage("Cuadro descargado como PNG.");
    } catch (e) {
      setExportMessage(exportMessageFor(e));
    } finally {
      setExporting(false);
    }
  };

  const exportVideo = async () => {
    setPlaying(false);
    setExporting(true);
    setExportMessage("Cargando cuadros…");
    try {
      const path = await exportSequence(frames, exportName, (done, all, phase) =>
        setExportMessage(
          phase === "loading"
            ? `Cargando cuadros ${done} / ${all}…`
            : phase === "recording"
              ? `Grabando video: cuadro ${done} / ${all}…`
              : `Descargando PNG ${done} / ${all}…`
        )
      );
      setExportMessage(
        path === "webm"
          ? `Video WebM descargado con ${total} segmentos, uno por cuadro.`
          : `Este navegador no puede grabar WebM: se descargaron ${total} imágenes PNG, una por cuadro, cada una con fecha, detector y atribución. Si faltan, permite descargas múltiples.`
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
  const overlayVisible = overlay !== undefined && ((showGaia && gaiaEnabled) || showTrack);

  return (
    <div
      className="grid gap-3 outline-none lg:grid-cols-[minmax(0,1fr)_280px]"
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="group"
      aria-label="Reproductor de secuencia. Espacio reproduce o pausa; flechas cambian de cuadro."
    >
      <div className="min-w-0">
        {result.served_from_cache && (
          <p
            role="status"
            className="mx-auto mb-2 max-w-[560px] rounded border border-gold/60 bg-deep p-2 text-xs font-semibold text-gold"
          >
            {cacheNotice(result)}. IRSA no respondió; este es el último resultado real de la misma petición, no uno
            reciente.
          </p>
        )}
        <div className="mx-auto mb-1 max-w-[560px]">
          <ResultBadge kind="observation" />
        </div>
        <div className={showReference && reference ? "grid gap-2 sm:grid-cols-2" : ""}>
        <div className="relative mx-auto aspect-square w-full max-w-[560px] overflow-hidden rounded border border-line bg-abyss">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={frameUrl(frame)}
            alt={`Cuadro ${frame.index + 1} de ${total}, ${frame.date_iso}, detector ${frame.detector}`}
            className="h-full w-full"
            style={{ imageRendering: "pixelated" }}
            draggable={false}
          />
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
                <line
                  x1={targetFirst.x}
                  y1={targetFirst.y}
                  x2={targetLast.x}
                  y2={targetLast.y}
                  stroke="#46d8ff"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {showTrack && targetNow && (
                <circle
                  cx={targetNow.x}
                  cy={targetNow.y}
                  r={overlay.uncertainty_px}
                  fill="none"
                  stroke="#46d8ff"
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
                  No se pudo cargar ningún cuadro de la secuencia. Reintenta en unos segundos.
                </p>
              ) : (
                <>
                  <Loader2 size={18} className="animate-spin text-pulse" />
                  <p>
                    Decodificando cuadros {preload.loaded + preload.failed} / {total}
                  </p>
                </>
              )}
            </div>
          )}
          <div className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-abyss/80 px-1.5 py-0.5 text-[11px] text-starlight">
            {shownIndex + 1} / {total}
          </div>
          <div className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-abyss/80 px-1.5 py-0.5 text-[10px] text-mutedstar">
            Norte arriba · Este a la izquierda
          </div>
        </div>
        {showReference && reference && (
          <figure className="mx-auto w-full max-w-[560px]">
            <div className="aspect-square overflow-hidden rounded border border-gold/60 bg-abyss">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl(reference.png_url)}
                alt={`Cuadro de referencia WISE, banda ${reference.band}, época ${reference.epoch_iso}`}
                className="h-full w-full"
                draggable={false}
              />
            </div>
            <figcaption className="mt-1 text-[10px] leading-snug text-gold">
              Otra misión, otra resolución. {reference.label} · banda {reference.band} · época{" "}
              {reference.epoch_iso || "no disponible"}
            </figcaption>
          </figure>
        )}
        </div>
        {overlay && (
          <fieldset className="mx-auto mt-2 max-w-[560px] rounded border border-line bg-deep p-2 text-[11px] text-mutedstar">
            <legend className="px-1 font-semibold text-starlight">Capas sobre la imagen</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <label className={`flex items-center gap-1 ${gaiaEnabled ? "" : "opacity-60"}`}>
                <input
                  type="checkbox"
                  checked={showGaia && gaiaEnabled}
                  disabled={!gaiaEnabled}
                  onChange={(e) => setShowGaia(e.target.checked)}
                />
                Marcas Gaia
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={showTrack} onChange={(e) => setShowTrack(e.target.checked)} />
                Trayectoria del objetivo
              </label>
              {reference && (
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={showReference}
                    onChange={(e) => setShowReference(e.target.checked)}
                  />
                  Cuadro WISE de referencia
                </label>
              )}
            </div>
            {!gaiaEnabled && overlay.gaia_warning && <p className="mt-1 text-gold">{overlay.gaia_warning}</p>}
            {showTrack && (
              <p className="mt-1">
                {overlay.proper_motion_applied
                  ? `La trayectoria usa el movimiento propio conocido${
                      overlay.displacement_arcsec !== undefined
                        ? ` (desplazamiento ${overlay.displacement_arcsec.toFixed(1).replace(".", ",")}″ en la ventana)`
                        : ""
                    }; el círculo es la incertidumbre de ${overlay.uncertainty_px}px.`
                  : "Sin movimiento propio conocido: el objetivo se marca en posición fija."}
              </p>
            )}
            {overlay.fov_hint && (
              <p className="mt-1 text-gold" role="status">
                Sugerencia: {overlay.fov_hint}
                {biggerFov !== null && onFovChange && (
                  <button
                    type="button"
                    onClick={() => onFovChange(biggerFov)}
                    className="ml-2 rounded border border-gold/60 px-2 py-0.5 text-starlight hover:border-pulse"
                  >
                    Usar campo de {biggerFov}′
                  </button>
                )}
              </p>
            )}
          </fieldset>
        )}
        {preload.failed > 0 && preload.done && preload.loaded > 0 && (
          <p className="mt-1 text-[11px] text-gold">
            {preload.failed} de {total} cuadros no se pudieron cargar; esos pasos pueden mostrarse vacíos.
          </p>
        )}

        {total === 1 ? (
          <p className="mt-2 rounded border border-line bg-deep p-2 text-xs text-mutedstar">
            Solo existe una época con cobertura de este campo en el archivo. No hay secuencia que reproducir:
            se muestra la única imagen disponible.
          </p>
        ) : (
          <div className="mx-auto mt-2 max-w-[560px]">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-mutedstar">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={!canAnimate}
                aria-label="Cuadro anterior"
                className="rounded border border-line p-1.5 hover:text-starlight disabled:opacity-40"
              >
                <SkipBack size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                disabled={!canAnimate}
                aria-label={playing ? "Pausar" : "Reproducir"}
                className="flex items-center gap-1 rounded bg-pulse px-3 py-1.5 font-bold text-abyss hover:brightness-110 disabled:opacity-40"
              >
                {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? "Pausar" : "Reproducir"}
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={!canAnimate}
                aria-label="Cuadro siguiente"
                className="rounded border border-line p-1.5 hover:text-starlight disabled:opacity-40"
              >
                <SkipForward size={14} />
              </button>
              <label className="ml-auto flex items-center gap-1">
                Velocidad
                <select
                  value={speedMs}
                  onChange={(e) => setSpeedMs(Number(e.target.value))}
                  className="rounded border border-line bg-deep px-1 py-0.5"
                >
                  {SPEEDS.map((s) => (
                    <option key={s.ms} value={s.ms}>
                      {s.label}
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
              aria-label="Posición en la secuencia"
              className="mt-2 w-full accent-[#46d8ff]"
            />
            {reducedMotion && (
              <p className="mt-1 text-[10px] text-mutedstar/80">
                Tu sistema pide movimiento reducido: la secuencia no se reproduce sola.
              </p>
            )}

            <fieldset className="mt-2 rounded border border-line bg-deep p-2 text-[11px] text-mutedstar">
              <legend className="px-1 font-semibold text-starlight">Parpadeo entre dos cuadros</legend>
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
                  {blink ? "Volver a la secuencia" : "Parpadear A/B"}
                </button>
              </div>
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
                <Link2 size={13} /> Copiar enlace
              </button>
            )}
            <button
              type="button"
              onClick={() => void exportPng()}
              disabled={!usable || exporting}
              className="flex items-center gap-1 rounded border border-line px-2 py-1 text-starlight hover:border-pulse disabled:opacity-40"
            >
              <Download size={13} /> Descargar cuadro actual (PNG)
            </button>
            {total > 1 && (
              <button
                type="button"
                onClick={() => void exportVideo()}
                disabled={!usable || exporting}
                className="flex items-center gap-1 rounded border border-line px-2 py-1 text-starlight hover:border-pulse disabled:opacity-40"
              >
                <Download size={13} /> Exportar video (WebM)
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
            {MODE_HELP[result.mode] ?? `Modo ${result.mode}.`}
          </p>
        </div>
      </div>

      <aside className="flex flex-col gap-2 text-[11px]" aria-label="Metadatos del cuadro">
        <div className="rounded border border-line bg-deep p-2">
          <p className="text-xs font-semibold text-starlight">
            Cuadro {shownIndex + 1} / {total}
          </p>
          <dl className="mt-1 flex flex-col gap-1.5 text-mutedstar">
            <div>
              <dt className="font-semibold text-starlight">Fecha</dt>
              <dd>{frame.date_iso}</dd>
            </div>
            <div>
              <dt className="font-semibold text-starlight">Detector</dt>
              <dd>{frame.detector}</dd>
              <HelpText>{FIELD_HELP.detector}</HelpText>
            </div>
            <div>
              <dt className="font-semibold text-starlight">Longitud de onda</dt>
              <dd>{frame.wavelength_um === null ? "no disponible" : `${frame.wavelength_um.toFixed(3).replace(".", ",")} µm`}</dd>
              <HelpText>{FIELD_HELP.wavelength}</HelpText>
            </div>
            <div>
              <dt className="font-semibold text-starlight">Píxeles con bandera</dt>
              <dd className={flaggedHigh ? "font-semibold text-gold" : ""}>{pct(frame.flagged_fraction)}</dd>
              <HelpText>{FIELD_HELP.flagged}</HelpText>
            </div>
            <div>
              <dt className="font-semibold text-starlight">Cobertura</dt>
              <dd>{pct(frame.coverage_fraction)}</dd>
              <HelpText>{FIELD_HELP.coverage}</HelpText>
            </div>
            <div>
              <dt className="font-semibold text-starlight">Colección</dt>
              <dd>{frame.collection}</dd>
              <HelpText>{FIELD_HELP.collection}</HelpText>
            </div>
            <div>
              <dt className="font-semibold text-starlight">Identificador</dt>
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
                Advertencia: el {pct(frame.flagged_fraction)} de los píxeles de este cuadro tiene bandera
                (umbral {Math.round(FLAGGED_WARNING_THRESHOLD * 100)} %). Interpreta con cautela cualquier cambio.
              </span>
            </p>
          )}
        </div>

        <div className="rounded border border-line bg-deep p-2 text-mutedstar">
          <p className="font-semibold text-starlight">Rejilla común</p>
          <p className="mt-0.5">
            {grid.size_px} × {grid.size_px} px · {grid.pixel_scale_arcsec.toFixed(2).replace(".", ",")} ″/px ·{" "}
            {grid.orientation}
          </p>
          <p className="mt-0.5">
            {result.n_used} cuadros usados de {result.n_available} disponibles
            {result.n_used < result.n_available ? " (se aplica el límite de cuadros solicitado)" : ""}.
          </p>
          <p className="mt-0.5 text-mutedstar/70">Versión de procesamiento {result.processing_version}</p>
          {motionMode && (
            <p className="mt-1 text-gold">
              Estas imágenes son una vista de secuencia, no una medición de movimiento.
            </p>
          )}
        </div>

        {result.limitations.length > 0 && (
          <div className="rounded border border-line bg-deep p-2">
            <p className="flex items-center gap-1 font-semibold text-gold">
              <TriangleAlert size={12} /> Limitaciones
            </p>
            <ul className="mt-0.5 flex flex-col gap-0.5 text-mutedstar">
              {result.limitations.map((l, i) => (
                <li key={i}>· {l}</li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
