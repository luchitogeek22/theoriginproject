"use client";

import { useEffect, useState } from "react";
import { assetUrl } from "@/lib/api";
import { formatArcsec, formatDate, motionSummary } from "@/lib/motion";
import type { SequenceResult } from "@/lib/types";
import { useReducedMotion } from "@/lib/useReducedMotion";

const BLINK_MS = 1000;
const MIN_COVERAGE = 0.8;

function Ring({ at, size, radius }: { at: { x: number; y: number } | null; size: number; radius: number }) {
  if (!at) return null;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <circle cx={at.x} cy={at.y} r={Math.max(radius, 1.6)} fill="none" stroke="#ffffff" strokeOpacity={0.9} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function MotionSentence({ result }: { result: SequenceResult }) {
  const summary = motionSummary(result.overlay, result.frames);
  if (!summary) return null;
  return (
    <div
      className="mx-auto mb-2 max-w-[560px] rounded border border-pulse/50 bg-deep p-2.5"
      data-testid="motion-sentence"
    >
      <p className="text-sm font-semibold text-starlight">
        Se movió {formatArcsec(summary.arcsec)}″ hacia el {summary.direction} entre {formatDate(summary.from)} y{" "}
        {formatDate(summary.to)}, igual que predice el catálogo.
      </p>
      <p className="mt-0.5 text-[10px] text-mutedstar">
        Es el movimiento propio catalogado que usa la trayectoria superpuesta; no es una medición hecha sobre estas
        imágenes.
      </p>
    </div>
  );
}

export default function BeforeAfter({ result }: { result: SequenceResult }) {
  const { frames } = result;
  const reducedMotion = useReducedMotion();
  const [position, setPosition] = useState(50);
  const [blink, setBlink] = useState(false);
  const [showAfter, setShowAfter] = useState(false);

  useEffect(() => {
    if (!blink || reducedMotion) return;
    const id = window.setInterval(() => setShowAfter((v) => !v), BLINK_MS);
    return () => window.clearInterval(id);
  }, [blink, reducedMotion]);

  if (frames.length < 2) return null;
  const goodFrames = frames.filter((f) => f.coverage_fraction >= MIN_COVERAGE);
  const usePicked = goodFrames.length >= 2;
  const before = usePicked ? goodFrames[0] : frames[0];
  const after = usePicked ? goodFrames[goodFrames.length - 1] : frames[frames.length - 1];
  const skippedEnds = usePicked && (before.index !== frames[0].index || after.index !== frames[frames.length - 1].index);
  const overlay = result.overlay;
  const size = result.grid.size_px;
  const ringFor = (index: number) => overlay?.target.find((p) => p.index === index) ?? null;
  const beforeRing = ringFor(before.index);
  const afterRing = ringFor(after.index);
  const faint = result.lightcurve?.target_detected === false;
  const rendering = result.mode === "motion" ? "auto" : "pixelated";
  const imgStyle = { imageRendering: rendering } as const;
  const cut = blink ? (showAfter ? 0 : 100) : position;

  return (
    <div className="mx-auto max-w-[560px]" data-testid="before-after">
      <div className="relative aspect-square w-full overflow-hidden rounded border border-line bg-abyss">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl(after.png_url)}
          alt={`Después: cuadro ${after.index + 1}, ${after.date_iso}`}
          className="absolute inset-0 h-full w-full"
          style={imgStyle}
          draggable={false}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl(before.png_url)}
          alt={`Antes: cuadro ${before.index + 1}, ${before.date_iso}`}
          className="absolute inset-0 h-full w-full"
          style={{ ...imgStyle, clipPath: `inset(0 ${100 - cut}% 0 0)` }}
          draggable={false}
        />
        <Ring at={afterRing} size={size} radius={overlay?.uncertainty_px ?? 1.6} />
        <div className="pointer-events-none absolute inset-0" style={{ clipPath: `inset(0 ${100 - cut}% 0 0)` }}>
          <Ring at={beforeRing} size={size} radius={overlay?.uncertainty_px ?? 1.6} />
        </div>
        {!blink && (
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-pulse"
            style={{ left: `${position}%` }}
            aria-hidden="true"
          />
        )}
        <div className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-abyss/80 px-1.5 py-0.5 text-[11px] text-starlight">
          Antes · {formatDate(before.date_iso)}
        </div>
        <div className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-abyss/80 px-1.5 py-0.5 text-[11px] text-starlight">
          Después · {formatDate(after.date_iso)}
        </div>
        <div className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-abyss/80 px-1.5 py-0.5 text-[10px] text-mutedstar">
          Norte arriba · Este a la izquierda
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-mutedstar">
        <label className="flex min-w-[200px] flex-1 items-center gap-2">
          Cortina
          <input
            type="range"
            min={0}
            max={100}
            value={position}
            disabled={blink}
            onChange={(e) => setPosition(Number(e.target.value))}
            aria-label="Cortina antes y después"
            aria-valuetext={`${position} % muestra el antes`}
            data-testid="before-after-slider"
            className="w-full accent-[#46d8ff]"
          />
        </label>
        <button
          type="button"
          aria-pressed={blink}
          disabled={reducedMotion}
          onClick={() => setBlink((b) => !b)}
          data-testid="before-after-blink"
          className={`rounded border px-2 py-1 disabled:opacity-40 ${blink ? "border-pulse text-pulse" : "border-line"}`}
        >
          Parpadeo
        </button>
      </div>
      {reducedMotion && (
        <p className="mt-1 text-[10px] text-mutedstar/80">
          Tu sistema pide movimiento reducido: el parpadeo automático está desactivado; usa la cortina.
        </p>
      )}
      <p className="mt-1 text-[10px] text-mutedstar/80">
        {skippedEnds
          ? "Se comparan las épocas extremas con buena cobertura (al menos 80 % del recorte), tras alinear las imágenes."
          : "Primera y última época de la secuencia, tras alinear las imágenes."}
        {beforeRing ? " El círculo blanco marca dónde debería estar el objetivo en cada época." : ""}
      </p>
      {faint && (
        <p className="mt-1 rounded border border-gold/60 bg-abyss p-1.5 text-[11px] text-gold" role="status">
          Este objetivo es demasiado débil para verlo a simple vista en cada cuadro: el círculo marca dónde debería
          estar. Para comprobarlo, usa el apilado de visitas (Planeta X) en las opciones avanzadas.
        </p>
      )}
    </div>
  );
}
