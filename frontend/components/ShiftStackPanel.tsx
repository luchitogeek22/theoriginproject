"use client";

import { translateLimitation } from "@/lib/limitations";
import { useMemo, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { api, assetUrl } from "@/lib/api";
import type { ShiftStackResult } from "@/lib/types";
import ResultBadge from "@/components/ResultBadge";
import { useJob } from "@/lib/useJob";

const STAGE_LABELS: Record<string, string> = {
  queued: "En cola",
  searching: "Buscando observaciones en el archivo",
  downloading: "Descargando recortes",
  processing: "Procesando cuadros",
  rendering: "Generando imágenes",
};

const SIZE = 340;
const PAD = { l: 44, r: 8, t: 8, b: 34 };

function fmt(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

function cellColor(value: number | null, max: number): string {
  if (value === null || !Number.isFinite(value)) return "#1c2946";
  const f = Math.max(0, Math.min(1, value / (max || 1)));
  const l = 12 + f * 62;
  return `hsl(${200 - f * 150} 80% ${l}%)`;
}

function Heatmap({ result }: { result: ShiftStackResult }) {
  const axis = result.velocity_axis_arcsec_yr ?? [];
  const map = result.significance_map ?? [];
  const best = result.best;
  const n = axis.length;
  const [selected, setSelected] = useState<{ ix: number; iy: number } | null>(null);
  const max = useMemo(() => Math.max(1, ...map.flat().map((v) => (v === null ? 0 : v))), [map]);
  if (n === 0 || !best) return null;

  const cell = (SIZE - PAD.l - PAD.r) / n;
  const bestIx = axis.findIndex((v) => v === best.v_east_arcsec_yr);
  const bestIy = axis.findIndex((v) => v === best.v_north_arcsec_yr);
  const px = (ix: number) => PAD.l + ix * cell;
  const py = (iy: number) => PAD.t + (n - 1 - iy) * cell;
  const sel = selected ?? (bestIx >= 0 && bestIy >= 0 ? { ix: bestIx, iy: bestIy } : null);
  const selValue = sel ? map[sel.iy]?.[sel.ix] : null;

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const base = sel ?? { ix: 0, iy: 0 };
    const delta: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    setSelected({
      ix: Math.max(0, Math.min(n - 1, base.ix + d[0])),
      iy: Math.max(0, Math.min(n - 1, base.iy + d[1])),
    });
  };

  return (
    <div>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-auto w-full max-w-[380px] rounded outline-none focus-visible:ring-2 focus-visible:ring-pulse"
        role="application"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Mapa de significancia por velocidad. Usa las flechas para elegir una velocidad."
      >
        <title>Significancia sin corregir por velocidad este y norte</title>
        {map.map((row, iy) =>
          row.map((v, ix) => (
            <rect
              key={`${ix}-${iy}`}
              x={px(ix)}
              y={py(iy)}
              width={cell}
              height={cell}
              fill={cellColor(v, max)}
              stroke="#04070f"
              strokeWidth={0.5}
              onClick={() => setSelected({ ix, iy })}
              style={{ cursor: "pointer" }}
            >
              <title>
                {`Este ${fmt(axis[ix])} ″/año, norte ${fmt(axis[iy])} ″/año: ${v === null ? "sin dato" : `${fmt(v)} σ`}`}
              </title>
            </rect>
          ))
        )}
        {bestIx >= 0 && bestIy >= 0 && (
          <rect x={px(bestIx)} y={py(bestIy)} width={cell} height={cell} fill="none" stroke="#ffffff" strokeWidth={2} />
        )}
        {sel && (
          <rect
            x={px(sel.ix) + 1}
            y={py(sel.iy) + 1}
            width={cell - 2}
            height={cell - 2}
            fill="none"
            stroke="#46d8ff"
            strokeWidth={2}
            strokeDasharray="3 2"
          />
        )}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
          <g key={i} fontSize={9} fill="#93a1c0">
            <text x={px(i) + cell / 2} y={SIZE - PAD.b + 12} textAnchor="middle">
              {fmt(axis[i], 0)}
            </text>
            <text x={PAD.l - 4} y={py(i) + cell / 2 + 3} textAnchor="end">
              {fmt(axis[i], 0)}
            </text>
          </g>
        ))}
        <text x={(PAD.l + SIZE - PAD.r) / 2} y={SIZE - 6} textAnchor="middle" fontSize={10} fill="#93a1c0">
          velocidad hacia el este (″/año)
        </text>
        <text
          transform={`translate(10 ${(PAD.t + SIZE - PAD.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={10}
          fill="#93a1c0"
        >
          velocidad hacia el norte (″/año)
        </text>
      </svg>
      <p className="mt-1 text-[11px] text-mutedstar" aria-live="polite">
        {sel
          ? `Velocidad elegida: este ${fmt(axis[sel.ix])} ″/año, norte ${fmt(axis[sel.iy])} ″/año; significancia sin corregir ${
              selValue === null || selValue === undefined ? "sin dato" : `${fmt(selValue)} σ`
            }.`
          : ""}{" "}
        Recuadro blanco: la mejor velocidad de la búsqueda.
      </p>
    </div>
  );
}

interface ShiftStackPanelProps {
  ra: number;
  dec: number;
  detector: number | null;
}

function TargetedSection({ check }: { check: NonNullable<ShiftStackResult["targeted"]> }) {
  const p = check.p_value ?? 1;
  const found = p <= 0.01 && (check.offset_px ?? 99) <= 1.5;
  return (
    <div className={`mt-3 rounded border p-2 text-[11px] text-mutedstar ${found ? "border-gold/70" : "border-line"} bg-abyss`} role="status">
      <p className="text-xs font-semibold text-starlight">
        Comprobación con el movimiento conocido del objetivo{" "}
        <ResultBadge kind="calculation" />
      </p>
      <p className="mt-1">
        {found
          ? "Hay señal en la posición prevista por su movimiento propio: es compatible con el objeto, pero requiere verificación."
          : "No hay señal significativa en la posición prevista por su movimiento propio."}
      </p>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <dt>Significancia en la posición prevista</dt>
        <dd className="text-starlight">{fmt(check.observed_sigma ?? 0)} σ</dd>
        <dt>Probabilidad de que el azar iguale ese pico (p)</dt>
        <dd className="text-starlight">{p < 0.001 ? "< 0,001" : p.toFixed(3)}</dd>
        <dt>Posiciones de comparación</dt>
        <dd className="text-starlight">{check.n_null}</dd>
        <dt>Desfase del pico respecto de lo previsto</dt>
        <dd className="text-starlight">{fmt(check.offset_px ?? 0)} px</dd>
        <dt>Movimiento previsto en la ventana</dt>
        <dd className="text-starlight">{fmt(check.predicted_motion_px ?? 0)} px</dd>
      </dl>
      {check.stack_png_url && (
        <figure className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl(check.stack_png_url)}
            alt="Imagen apilada siguiendo el movimiento propio del objetivo"
            className="aspect-square w-full max-w-[260px] rounded border border-line"
            style={{ imageRendering: "pixelated" }}
          />
          <figcaption className="mt-0.5">Apilado siguiendo su movimiento propio.</figcaption>
        </figure>
      )}
      <ul className="mt-1">
        {check.limitations.map((l, i) => (
          <li key={i}>· {translateLimitation(l)}</li>
        ))}
      </ul>
    </div>
  );
}

export default function ShiftStackPanel({ ra, dec, detector }: ShiftStackPanelProps) {
  const posKey = `${ra.toFixed(6)}|${dec.toFixed(6)}|${detector ?? ""}`;
  const [started, setStarted] = useState<string | null>(null);
  const key = started === posKey ? `shift-stack|${posKey}` : null;

  const job = useJob<ShiftStackResult>(key, (signal) =>
    api.createShiftStack({ ra_deg: ra, dec_deg: dec, size_arcmin: 4, ...(detector ? { detector } : {}) }, { signal })
  );
  const busy = job.phase === "creating" || job.phase === "running";
  const result = job.phase === "completed" ? job.result : null;
  const best = result?.ok ? result.best : undefined;
  const stage = job.job?.stage ? (STAGE_LABELS[job.job.stage] ?? job.job.stage) : "Enviando la petición";

  return (
    <section className="rounded border border-line bg-deep p-3" aria-label="Modo Planeta X">
      <h2 className="text-sm font-semibold text-starlight">
        Modo Planeta X: búsqueda por apilado <ResultBadge kind="calculation" />
      </h2>
      <p className="mt-1 max-w-2xl text-[11px] text-mutedstar">
        Desplaza y suma las exposiciones probando muchas velocidades en el cielo. Una fuente tenue que se mueve
        aparece como un pico a su velocidad. Es una búsqueda con muchos intentos: la significancia corregida descuenta
        ese efecto.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => (job.phase === "idle" || key === null ? setStarted(posKey) : job.retry())}
        className="mt-2 rounded bg-pulse px-3 py-1.5 text-xs font-bold text-abyss hover:brightness-110 disabled:opacity-40"
      >
        {result || job.phase === "failed" || job.phase === "cancelled" ? "Repetir la búsqueda" : "Buscar objetos en movimiento"}
      </button>

      <div aria-live="polite">
        {busy && (
          <div className="mt-2 text-xs text-starlight">
            <p className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-pulse" />
              {stage}
              {job.job && (job.job.total ?? 0) > 0 ? ` (${job.job.done} / ${job.job.total})` : ""}
            </p>
            <button
              type="button"
              onClick={job.cancel}
              className="mt-1 rounded border border-line px-3 py-1 text-mutedstar hover:border-pulse"
            >
              Cancelar
            </button>
          </div>
        )}
        {job.phase === "cancelled" && <p className="mt-2 text-xs text-mutedstar">Dejaste de esperar esta búsqueda.</p>}
        {job.phase === "failed" && (
          <p role="alert" className="mt-2 flex items-center gap-1 text-xs text-red-300">
            <TriangleAlert size={13} /> {job.error}
          </p>
        )}
      </div>

      {result && !result.ok && (
        <div className="mt-2 rounded border border-gold/60 bg-abyss p-2 text-xs text-gold">
          <p className="font-semibold">Búsqueda no realizada: hay {result.n_visits} visitas y se necesitan al menos 3.</p>
          <ul className="mt-1">
            {result.limitations.map((l, i) => (
              <li key={i}>· {translateLimitation(l)}</li>
            ))}
          </ul>
        </div>
      )}

      {result?.ok && best && (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <Heatmap result={result} />
          <div className="flex flex-col gap-2 text-[11px] text-mutedstar">
            <div
              className={`rounded border p-2 ${best.detected ? "border-gold/70" : "border-line"} bg-abyss`}
              role="status"
            >
              <p className="text-xs font-semibold text-starlight">
                {best.detected
                  ? "Señal compatible con un objeto en movimiento, requiere verificación."
                  : "Sin señal significativa tras corregir por búsqueda múltiple."}
              </p>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                <dt>Significancia sin corregir</dt>
                <dd className="text-starlight">{fmt(best.sigma_raw)} σ</dd>
                <dt>Significancia corregida</dt>
                <dd className="text-starlight">{fmt(best.sigma_corrected)} σ</dd>
                <dt>Intentos (velocidades × posiciones)</dt>
                <dd className="text-starlight">{best.n_trials}</dd>
                <dt>Umbral</dt>
                <dd className="text-starlight">{result.threshold_sigma !== undefined ? `${fmt(result.threshold_sigma)} σ` : "—"}</dd>
                <dt>Mejor velocidad</dt>
                <dd className="text-starlight">
                  E {fmt(best.v_east_arcsec_yr)} · N {fmt(best.v_north_arcsec_yr)} ″/año
                </dd>
                <dt>Visitas</dt>
                <dd className="text-starlight">{result.n_visits}</dd>
              </dl>
            </div>
            {result.stack_png_url && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetUrl(result.stack_png_url)}
                  alt="Imagen apilada a la mejor velocidad de la búsqueda"
                  className="aspect-square w-full max-w-[260px] rounded border border-line"
                  style={{ imageRendering: "pixelated" }}
                />
                <figcaption className="mt-0.5">Imagen apilada a la mejor velocidad.</figcaption>
              </figure>
            )}
          </div>
        </div>
      )}

      {result?.targeted?.ok && <TargetedSection check={result.targeted} />}

      {result && result.limitations.length > 0 && result.ok && (
        <ul className="mt-2 text-[11px] text-mutedstar">
          {result.limitations.map((l, i) => (
            <li key={i}>· {translateLimitation(l)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
