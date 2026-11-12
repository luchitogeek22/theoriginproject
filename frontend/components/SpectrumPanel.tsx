"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useTranslateLimitation } from "@/lib/limitations";
import { useId, useMemo, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import type { SpectrumColor, SpectrumPoint, SpectrumResult } from "@/lib/types";
import ResultBadge from "@/components/ResultBadge";
import { useJob } from "@/lib/useJob";

const PALETTE = ["#46d8ff", "#f4a259", "#9675ff", "#6ee7a8", "#f472b6", "#facc15", "#60a5fa", "#fb7185"];
const W = 600;
const H = 280;
const PAD = { l: 58, r: 14, t: 14, b: 42 };

const STAGES = ["queued", "searching", "downloading", "measuring"] as const;
type KnownStage = (typeof STAGES)[number];

const isKnownStage = (stage: string): stage is KnownStage => (STAGES as readonly string[]).includes(stage);

/** Human-facing number with fixed fraction digits, in the active locale. */
function useNumbers() {
  const format = useFormatter();
  return {
    fmt: (value: number, digits = 2) =>
      format.number(value, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    sig: (value: number) => format.number(value, { minimumSignificantDigits: 3, maximumSignificantDigits: 3 }),
    date: (iso: string) => format.dateTime(new Date(iso), { year: "numeric", month: "short", day: "numeric" }),
  };
}

function dateKey(p: SpectrumPoint): string {
  return p.date_iso.slice(0, 10);
}

function Plot({ points }: { points: SpectrumPoint[] }) {
  const uid = useId();
  const t = useTranslations("spectrumPanel");
  const { fmt, sig, date } = useNumbers();
  const dates = useMemo(() => Array.from(new Set(points.map(dateKey))).sort(), [points]);
  const colorOf = (p: SpectrumPoint) => PALETTE[dates.indexOf(dateKey(p)) % PALETTE.length];
  if (points.length === 0) return null;

  const xs = points.map((p) => p.wavelength_um);
  const minX = Math.min(...xs) - 0.1;
  const maxX = Math.max(...xs) + 0.1;
  const lows = points.map((p) => p.flux_jy - (p.flux_jy_err ?? 0));
  const highs = points.map((p) => p.flux_jy + (p.flux_jy_err ?? 0));
  let minY = Math.min(...lows);
  let maxY = Math.max(...highs);
  if (maxY - minY < 1e-12) {
    minY -= 1;
    maxY += 1;
  }
  const m = (maxY - minY) * 0.08;
  minY -= m;
  maxY += m;
  const sx = (v: number) => PAD.l + ((v - minX) / (maxX - minX)) * (W - PAD.l - PAD.r);
  const sy = (v: number) => PAD.t + (1 - (v - minY) / (maxY - minY)) * (H - PAD.t - PAD.b);
  const yTicks = [0, 0.5, 1].map((f) => minY + f * (maxY - minY));
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => minX + f * (maxX - minX));
  const flaggedCount = points.filter((p) => p.flagged).length;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${uid}-t ${uid}-d`} className="h-auto w-full max-w-[680px]">
        <title id={`${uid}-t`}>{t("plotTitle", { count: points.length })}</title>
        <desc id={`${uid}-d`}>
          {[
            t("plotDesc", { count: points.length, min: fmt(Math.min(...xs)), max: fmt(Math.max(...xs)), dates: dates.length }),
            flaggedCount ? t("plotDescFlagged", { count: flaggedCount }) : null,
            t("plotDescFlux", { min: fmt(Math.min(...lows), 4), max: fmt(Math.max(...highs), 4) }),
          ]
            .filter(Boolean)
            .join(" ")}
        </desc>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(tick)} y2={sy(tick)} stroke="#1c2946" />
            <text x={PAD.l - 6} y={sy(tick) + 3} textAnchor="end" fontSize={10} fill="#93a1c0">
              {sig(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={tick} x={sx(tick)} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="#93a1c0">
            {fmt(tick, 1)}
          </text>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="#93a1c0" />
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#93a1c0">
          {t("axisX")}
        </text>
        <text transform={`translate(12 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10} fill="#93a1c0">
          {t("axisY")}
        </text>
        {points.map((p, i) => {
          const c = colorOf(p);
          const e = p.flux_jy_err ?? 0;
          return (
            <g key={i}>
              {e > 0 && (
                <line x1={sx(p.wavelength_um)} x2={sx(p.wavelength_um)} y1={sy(p.flux_jy - e)} y2={sy(p.flux_jy + e)} stroke={c} strokeWidth={1.2} />
              )}
              <circle
                cx={sx(p.wavelength_um)}
                cy={sy(p.flux_jy)}
                r={3.5}
                fill={p.flagged ? "none" : c}
                stroke={c}
                strokeWidth={1.5}
              >
                <title>
                  {t("pointTitle", {
                    date: date(p.date_iso),
                    detector: p.detector ?? "—",
                    wavelength: fmt(p.wavelength_um, 3),
                    flux: sig(p.flux_jy),
                  }) + (p.flagged ? ` · ${t("pointFlagged")}` : "")}
                </title>
              </circle>
            </g>
          );
        })}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-mutedstar" aria-label={t("legendLabel")}>
        {dates.map((d, i) => (
          <li key={d} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden="true" />
            {date(d)}
          </li>
        ))}
        {flaggedCount > 0 && (
          <li className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-mutedstar" aria-hidden="true" />{" "}
            {t("legendFlagged", { count: flaggedCount })}
          </li>
        )}
      </ul>
    </div>
  );
}

function ColorGauge({ color }: { color: SpectrumColor }) {
  const uid = useId();
  const t = useTranslations("spectrumPanel");
  const { fmt } = useNumbers();
  if (!color.available || color.index === undefined) {
    return (
      <p className="text-[11px] text-mutedstar">
        {t("colorUnavailable", { reason: color.reason ?? t("colorNoReason") })}
      </p>
    );
  }
  const idx = Math.max(-1, Math.min(1, color.index));
  const err = color.index_err ?? 0;
  const pos = (v: number) => ((Math.max(-1, Math.min(1, v)) + 1) / 2) * 100;
  return (
    <div>
      <p id={`${uid}-l`} className="text-xs font-semibold text-starlight">
        {t("colorTitle", { index: fmt(color.index), err: fmt(err) })}
      </p>
      <div
        className="relative mt-2 h-4 max-w-md rounded border border-line"
        style={{ background: "linear-gradient(to right, #60a5fa, #e8eefc, #f87171)" }}
        role="meter"
        aria-labelledby={`${uid}-l`}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={idx}
      >
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 bg-abyss/70"
          style={{ left: `${pos(idx - err)}%`, width: `${pos(idx + err) - pos(idx - err)}%` }}
          aria-hidden="true"
        />
        <div className="absolute -top-1 h-6 w-1 bg-abyss ring-1 ring-starlight" style={{ left: `calc(${pos(idx)}% - 2px)` }} aria-hidden="true" />
      </div>
      <div className="flex max-w-md justify-between text-[10px] text-mutedstar">
        <span>{t("bluer")}</span>
        <span>0</span>
        <span>{t("redder")}</span>
      </div>
      {color.reading && <p className="mt-1 text-[11px] text-starlight">{color.reading}</p>}
      {color.reference_note && <p className="text-[11px] text-mutedstar">{color.reference_note}</p>}
    </div>
  );
}

export default function SpectrumPanel({ ra, dec }: { ra: number; dec: number }) {
  const t = useTranslations("spectrumPanel");
  const tc = useTranslations("common");
  const translateLimitation = useTranslateLimitation();
  const posKey = `${ra.toFixed(6)}|${dec.toFixed(6)}`;
  const [started, setStarted] = useState<string | null>(null);
  const key = started === posKey ? `spectrum|${posKey}` : null;
  const job = useJob<SpectrumResult>(key, (signal) => api.createSpectrum({ ra_deg: ra, dec_deg: dec }, { signal }));
  const busy = job.phase === "creating" || job.phase === "running";
  const result = job.phase === "completed" ? job.result : null;
  const rawStage = job.job?.stage;
  const stage = rawStage ? (isKnownStage(rawStage) ? t(`stages.${rawStage}`) : rawStage) : t("stages.sending");

  return (
    <section className="mt-4 rounded border border-line bg-deep p-3" aria-label={t("title")}>
      <h2 className="text-sm font-semibold text-starlight">
        {t("title")} <ResultBadge kind="calculation" />
      </h2>
      <p className="mt-1 max-w-2xl text-[11px] text-mutedstar">
        {t("intro")}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => (key === null ? setStarted(posKey) : job.retry())}
        className="mt-2 rounded bg-pulse px-3 py-1.5 text-xs font-bold text-starlight hover:brightness-110 disabled:opacity-40"
      >
        {result ? t("remeasure") : t("measure")}
      </button>

      <div aria-live="polite">
        {busy && (
          <div className="mt-2 text-xs text-starlight">
            <p className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-pulse" />
              {stage}
              {job.job && (job.job.total ?? 0) > 0 ? ` (${job.job.done} / ${job.job.total})` : ""}
            </p>
            <button type="button" onClick={job.cancel} className="mt-1 rounded border border-line px-3 py-1 text-mutedstar hover:border-pulse">
              {tc("cancel")}
            </button>
          </div>
        )}
        {job.phase === "cancelled" && <p className="mt-2 text-xs text-mutedstar">{t("cancelled")}</p>}
        {job.phase === "failed" && (
          <p role="alert" className="mt-2 flex items-center gap-1 text-xs text-red-300">
            <TriangleAlert size={13} /> {job.error}
          </p>
        )}
      </div>

      {result && (
        <div className="mt-3 flex flex-col gap-3">
          {result.points.length === 0 ? (
            <p className="text-xs text-mutedstar">{t("noPoints")}</p>
          ) : (
            <figure>
              <Plot points={result.points} />
              <figcaption className="mt-1 text-[11px] text-gold">
                {t("caption")} <span className="text-mutedstar">({result.label})</span>
              </figcaption>
            </figure>
          )}
          <ColorGauge color={result.color} />
          {result.limitations.length > 0 && (
            <ul className="text-[11px] text-mutedstar">
              {result.limitations.map((l, i) => (
                <li key={i}>· {translateLimitation(l)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
