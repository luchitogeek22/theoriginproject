"use client";

import { useTranslateLimitation } from "@/lib/limitations";
import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Loader2, TriangleAlert } from "lucide-react";
import { api, assetUrl } from "@/lib/api";
import type { ShiftStackResult } from "@/lib/types";
import ResultBadge from "@/components/ResultBadge";
import { useJob } from "@/lib/useJob";

const STAGES = ["queued", "searching", "downloading", "processing", "rendering"] as const;
type StageKey = (typeof STAGES)[number];
const isStage = (stage: string): stage is StageKey => (STAGES as readonly string[]).includes(stage);

const SIZE = 340;
const PAD = { l: 44, r: 8, t: 8, b: 34 };

/** Fixed-decimal number in the active locale's notation. */
function useFmt(): (value: number, digits?: number) => string {
  const format = useFormatter();
  return (value, digits = 1) =>
    format.number(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function cellColor(value: number | null, max: number): string {
  if (value === null || !Number.isFinite(value)) return "#1c2946";
  const f = Math.max(0, Math.min(1, value / (max || 1)));
  const l = 12 + f * 62;
  return `hsl(${200 - f * 150} 80% ${l}%)`;
}

function Heatmap({ result }: { result: ShiftStackResult }) {
  const t = useTranslations("shiftStack.heatmap");
  const fmt = useFmt();
  const sigmaText = (v: number | null | undefined) =>
    v === null || v === undefined ? t("noData") : t("sigma", { value: fmt(v) });
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
        aria-label={t("label")}
      >
        <title>{t("title")}</title>
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
                {t("cell", { east: fmt(axis[ix]), north: fmt(axis[iy]), value: sigmaText(v) })}
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
          {t("eastAxis")}
        </text>
        <text
          transform={`translate(10 ${(PAD.t + SIZE - PAD.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={10}
          fill="#93a1c0"
        >
          {t("northAxis")}
        </text>
      </svg>
      <p className="mt-1 text-[11px] text-mutedstar" aria-live="polite">
        {sel ? t("selected", { east: fmt(axis[sel.ix]), north: fmt(axis[sel.iy]), value: sigmaText(selValue) }) : ""}{" "}
        {t("bestBox")}
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
  const t = useTranslations("shiftStack.targeted");
  const fmt = useFmt();
  const translateLimitation = useTranslateLimitation();
  const p = check.p_value ?? 1;
  const found = p <= 0.01 && (check.offset_px ?? 99) <= 1.5;
  return (
    <div className={`mt-3 rounded border p-2 text-[11px] text-mutedstar ${found ? "border-gold/70" : "border-line"} bg-abyss`} role="status">
      <p className="text-xs font-semibold text-starlight">
        {t("title")}{" "}
        <ResultBadge kind="calculation" />
      </p>
      <p className="mt-1">
        {found ? t("found") : t("notFound")}
      </p>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <dt>{t("sigma")}</dt>
        <dd className="text-starlight">{fmt(check.observed_sigma ?? 0)} σ</dd>
        <dt>{t("pValue")}</dt>
        <dd className="text-starlight">{p < 0.001 ? `< ${fmt(0.001, 3)}` : fmt(p, 3)}</dd>
        <dt>{t("nNull")}</dt>
        <dd className="text-starlight">{check.n_null}</dd>
        <dt>{t("offset")}</dt>
        <dd className="text-starlight">{fmt(check.offset_px ?? 0)} px</dd>
        <dt>{t("predicted")}</dt>
        <dd className="text-starlight">{fmt(check.predicted_motion_px ?? 0)} px</dd>
      </dl>
      {check.stack_png_url && (
        <figure className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl(check.stack_png_url)}
            alt={t("stackAlt")}
            className="aspect-square w-full max-w-[260px] rounded border border-line"
            style={{ imageRendering: "pixelated" }}
          />
          <figcaption className="mt-0.5">{t("stackCaption")}</figcaption>
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
  const t = useTranslations("shiftStack");
  const fmt = useFmt();
  const translateLimitation = useTranslateLimitation();
  const posKey = `${ra.toFixed(6)}|${dec.toFixed(6)}|${detector ?? ""}`;
  const [started, setStarted] = useState<string | null>(null);
  const key = started === posKey ? `shift-stack|${posKey}` : null;

  const job = useJob<ShiftStackResult>(key, (signal) =>
    api.createShiftStack({ ra_deg: ra, dec_deg: dec, size_arcmin: 4, ...(detector ? { detector } : {}) }, { signal })
  );
  const busy = job.phase === "creating" || job.phase === "running";
  const result = job.phase === "completed" ? job.result : null;
  const best = result?.ok ? result.best : undefined;
  const rawStage = job.job?.stage;
  const stage = rawStage ? (isStage(rawStage) ? t(`stage.${rawStage}`) : rawStage) : t("stage.sending");

  return (
    <section className="rounded border border-line bg-deep p-3" aria-label={t("sectionLabel")}>
      <h2 className="text-sm font-semibold text-starlight">
        {t("title")} <ResultBadge kind="calculation" />
      </h2>
      <p className="mt-1 max-w-2xl text-[11px] text-mutedstar">
        {t("intro")}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => (job.phase === "idle" || key === null ? setStarted(posKey) : job.retry())}
        className="mt-2 rounded bg-pulse px-3 py-1.5 text-xs font-bold text-abyss hover:brightness-110 disabled:opacity-40"
      >
        {result || job.phase === "failed" || job.phase === "cancelled" ? t("repeat") : t("start")}
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
              {t("cancel")}
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

      {result && !result.ok && (
        <div className="mt-2 rounded border border-gold/60 bg-abyss p-2 text-xs text-gold">
          <p className="font-semibold">{t("notRun", { visits: result.n_visits })}</p>
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
                {best.detected ? t("detected") : t("notDetected")}
              </p>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                <dt>{t("sigmaRaw")}</dt>
                <dd className="text-starlight">{fmt(best.sigma_raw)} σ</dd>
                <dt>{t("sigmaCorrected")}</dt>
                <dd className="text-starlight">{fmt(best.sigma_corrected)} σ</dd>
                <dt>{t("trials")}</dt>
                <dd className="text-starlight">{best.n_trials}</dd>
                <dt>{t("threshold")}</dt>
                <dd className="text-starlight">{result.threshold_sigma !== undefined ? `${fmt(result.threshold_sigma)} σ` : "—"}</dd>
                <dt>{t("bestVelocity")}</dt>
                <dd className="text-starlight">
                  {t("bestVelocityValue", { east: fmt(best.v_east_arcsec_yr), north: fmt(best.v_north_arcsec_yr) })}
                </dd>
                <dt>{t("visits")}</dt>
                <dd className="text-starlight">{result.n_visits}</dd>
              </dl>
            </div>
            {result.stack_png_url && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetUrl(result.stack_png_url)}
                  alt={t("stackAlt")}
                  className="aspect-square w-full max-w-[260px] rounded border border-line"
                  style={{ imageRendering: "pixelated" }}
                />
                <figcaption className="mt-0.5">{t("stackCaption")}</figcaption>
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
