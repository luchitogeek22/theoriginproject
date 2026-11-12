"use client";

import { translateLimitation } from "@/lib/limitations";
import { useId } from "react";
import { TriangleAlert } from "lucide-react";
import type { LightCurve as LightCurveData } from "@/lib/types";
import ResultBadge from "@/components/ResultBadge";

const W = 560;
const H = 230;
const PAD = { l: 52, r: 14, t: 14, b: 40 };

function fmt(value: number, digits = 3): string {
  return value.toFixed(digits).replace(".", ",");
}

export default function LightCurve({ curve }: { curve: LightCurveData }) {
  const uid = useId();
  const { points, relative } = curve;
  const used = points.filter((p) => p.used && p.value !== null);
  const unused = points.filter((p) => !p.used || p.value === null);
  const scatter = relative ? curve.comparison_scatter : null;

  if (points.length === 0) return null;

  const mjds = points.map((p) => p.mjd);
  const minX = Math.min(...mjds);
  const maxX = Math.max(...mjds);
  const spanX = maxX - minX || 1;
  const lows = used.map((p) => (p.value as number) - (p.err ?? 0));
  const highs = used.map((p) => (p.value as number) + (p.err ?? 0));
  if (scatter !== null) {
    lows.push(1 - scatter);
    highs.push(1 + scatter);
  }
  let minY = lows.length ? Math.min(...lows) : 0;
  let maxY = highs.length ? Math.max(...highs) : 1;
  if (maxY - minY < 1e-9) {
    minY -= 0.5;
    maxY += 0.5;
  }
  const margin = (maxY - minY) * 0.08;
  minY -= margin;
  maxY += margin;

  const sx = (mjd: number) => PAD.l + (points.length === 1 ? 0.5 : (mjd - minX) / spanX) * (W - PAD.l - PAD.r);
  const sy = (v: number) => PAD.t + (1 - (v - minY) / (maxY - minY)) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => minY + f * (maxY - minY));

  const values = used.map((p) => p.value as number);
  const lo = values.length ? Math.min(...values) : null;
  const hi = values.length ? Math.max(...values) : null;
  const summary =
    lo !== null && hi !== null
      ? `${used.length} de ${points.length} épocas con medida. Mínimo ${fmt(lo)}, máximo ${fmt(hi)}, amplitud ${fmt(hi - lo)}${
          curve.method === "psf_wings"
            ? " (amplitud relativa de las alas de la PSF, normalizada a la mediana)"
            : relative
              ? " (flujo relativo, normalizado a la mediana)"
              : " (flujo absoluto)"
        }.`
      : "Ninguna época tiene una medida utilizable.";
  const path = used.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.mjd).toFixed(1)},${sy(p.value as number).toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <section className="rounded border border-line bg-deep p-3" aria-label="Curva de luz del objetivo">
      <h2 className="text-sm font-semibold text-starlight">
        Curva de luz <ResultBadge kind="calculation" />
      </h2>
      {!relative && (
        <p role="alert" className="mt-1 flex items-start gap-1 rounded border border-gold/60 bg-abyss p-1.5 text-[11px] font-semibold text-gold">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          <span>Flujo absoluto: no corregido por cambios comunes. Un cambio de brillo aquí puede venir del instrumento.</span>
        </p>
      )}
      {curve.target_detected === false && (
        <p role="alert" className="mt-1 flex items-start gap-1 rounded border border-gold/60 bg-abyss p-1.5 text-[11px] font-semibold text-gold">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          <span>
            El objetivo no se detecta por separado en cada cuadro
            {curve.target_median_snr != null ? ` (SNR mediana ${curve.target_median_snr.toFixed(1)})` : ""}: la
            curva refleja sobre todo ruido. Para objetos débiles usa el apilado.
          </span>
        </p>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${uid}-t ${uid}-d`}
        className="mt-2 h-auto w-full max-w-[640px]"
      >
        <title id={`${uid}-t`}>Curva de luz de {points.length} épocas</title>
        <desc id={`${uid}-d`}>{summary}</desc>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="#1c2946" strokeWidth={1} />
            <text x={PAD.l - 6} y={sy(t) + 3} textAnchor="end" fontSize={10} fill="#93a1c0">
              {fmt(t, relative ? 2 : 3)}
            </text>
          </g>
        ))}
        {scatter !== null && (
          <g>
            <rect
              x={PAD.l}
              y={sy(1 + scatter)}
              width={W - PAD.l - PAD.r}
              height={Math.max(1, sy(1 - scatter) - sy(1 + scatter))}
              fill="#c8a45c"
              opacity={0.18}
            />
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(1)} y2={sy(1)} stroke="#c8a45c" strokeDasharray="4 3" strokeWidth={1} />
          </g>
        )}
        {path && <path d={path} fill="none" stroke="#46d8ff" strokeOpacity={0.5} strokeWidth={1} />}
        {used.map((p) => (
          <g key={p.index}>
            {p.err !== null && (
              <line
                x1={sx(p.mjd)}
                x2={sx(p.mjd)}
                y1={sy((p.value as number) - p.err)}
                y2={sy((p.value as number) + p.err)}
                stroke="#46d8ff"
                strokeWidth={1.5}
              />
            )}
            <circle cx={sx(p.mjd)} cy={sy(p.value as number)} r={3.5} fill="#46d8ff" />
          </g>
        ))}
        {unused.map((p) => (
          <g key={p.index} stroke="#f87171" strokeWidth={1.5}>
            <line x1={sx(p.mjd) - 3.5} x2={sx(p.mjd) + 3.5} y1={H - PAD.b - 9} y2={H - PAD.b - 2} />
            <line x1={sx(p.mjd) - 3.5} x2={sx(p.mjd) + 3.5} y1={H - PAD.b - 2} y2={H - PAD.b - 9} />
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="#93a1c0" />
        <text x={PAD.l} y={H - PAD.b + 14} fontSize={10} fill="#93a1c0">
          {first.date_iso.slice(0, 10)}
        </text>
        <text x={W - PAD.r} y={H - PAD.b + 14} fontSize={10} fill="#93a1c0" textAnchor="end">
          {last.date_iso.slice(0, 10)}
        </text>
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} fontSize={10} fill="#93a1c0" textAnchor="middle">
          fecha de observación
        </text>
        <text
          transform={`translate(12 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}
          fontSize={10}
          fill="#93a1c0"
          textAnchor="middle"
        >
          {curve.method === "psf_wings" ? "amplitud relativa de las alas de la PSF" : relative ? "flujo relativo" : "flujo absoluto"}
        </text>
      </svg>

      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mutedstar">
        <li className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-pulse" aria-hidden="true" /> medida ± error
        </li>
        {scatter !== null && (
          <li className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-4 bg-gold/30" aria-hidden="true" /> ruido de referencia (±{fmt(scatter)}, {curve.n_comparisons} estrellas de comparación)
          </li>
        )}
        {unused.length > 0 && (
          <li className="flex items-center gap-1 text-red-300">
            <span aria-hidden="true">×</span> sin medida utilizable (bandera o fuera de cobertura): cuadros{" "}
            {unused.map((p) => p.index + 1).join(", ")}
          </li>
        )}
      </ul>
      <p className="mt-1 text-[11px] text-starlight">{summary}</p>
      <p className="mt-1 text-[11px] text-mutedstar">{translateLimitation(curve.label)}</p>
      {curve.limitations.length > 0 && (
        <ul className="mt-1 text-[11px] text-mutedstar">
          {curve.limitations.map((l, i) => (
            <li key={i}>· {translateLimitation(l)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
