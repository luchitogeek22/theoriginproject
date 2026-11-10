"use client";

/** SPECTRAL LAB — measured profiles only. No curve is drawn without samples
 * from the spectral engine (WCS-WAVE visualization grade; CWAVE/CBAND noted).
 */

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, TriangleAlert } from "lucide-react";
import { ApiError, SpectralResult, api, pollJob } from "@/lib/api";

/** plotly.js-dist-min touches `self` at import time, so it is loaded
 * dynamically inside the effect (browser only), never during SSR. */
interface PlotlyLike {
  newPlot: (el: HTMLElement, data: unknown[], layout?: unknown, config?: unknown) => Promise<void>;
  react: (el: HTMLElement, data: unknown[], layout?: unknown, config?: unknown) => Promise<void>;
  purge: (el: HTMLElement) => void;
}
import { mjdToDate } from "@/lib/coords";
import { useResearch } from "@/lib/store";

export default function SpectralLab() {
  const { mode, target, selected, cutouts } = useResearch();
  const [cutoutId, setCutoutId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SpectralResult | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<PlotlyLike | null>(null);

  useEffect(() => {
    if (cutoutId === "" && cutouts.length > 0) setCutoutId(cutouts[0].cutout_id);
  }, [cutouts, cutoutId]);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    if (!result || result.samples.length === 0) {
      plotlyRef.current?.purge(el);
      return;
    }
    let cancelled = false;
    void (async () => {
      const mod = await import("plotly.js-dist-min");
      if (cancelled) return;
      const Plotly = mod.default as PlotlyLike;
      plotlyRef.current = Plotly;
      drawSpectrum(Plotly, el, result);
    })();
    return () => {
      cancelled = true;
    };
  }, [result]);

  useEffect(() => {
    const el = plotRef.current;
    return () => {
      if (el) plotlyRef.current?.purge(el);
    };
  }, []);

  function drawSpectrum(Plotly: PlotlyLike, el: HTMLDivElement, res: SpectralResult) {
    const withWave = res.samples.filter((s) => s.wavelength_um !== null);
    const useWave = withWave.length > 2;
    const x = res.samples.map((s) => (useWave ? (s.wavelength_um as number) : s.row));
    const y = res.samples.map((s) => s.flux);
    const err = res.samples.map((s) => s.flux_err ?? 0);
    void Plotly.react(
      el,
      [
        {
          x,
          y,
          error_y: { type: "data", array: err, visible: true, color: "#46d8ff55" },
          mode: "lines+markers",
          marker: { size: 4, color: "#46d8ff" },
          line: { color: "#46d8ff", width: 1.5 },
          name: "flujo medido",
        },
      ],
      {
        paper_bgcolor: "#0a1122",
        plot_bgcolor: "#0a1122",
        font: { color: "#93a1c0", size: 11 },
        margin: { l: 60, r: 16, t: 12, b: 48 },
        xaxis: {
          title: useWave ? "longitud de onda (µm)" : "fila del detector",
          gridcolor: "#1c2946",
          zerolinecolor: "#1c2946",
        },
        yaxis: { title: `flujo (${res.flux_unit})`, gridcolor: "#1c2946", zerolinecolor: "#1c2946" },
        showlegend: false,
      },
      { responsive: true, displayModeBar: true, displaylogo: false }
    );
  }

  const run = async () => {
    if (!target || cutoutId === "" || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const job = await api.analyzeSpectral({
        cutout_id: Number(cutoutId),
        ra_deg: target.ra_deg,
        dec_deg: target.dec_deg,
      });
      const res = await pollJob<SpectralResult>(job.job_id);
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Spectral extraction failed");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!result) return;
    const lines = ["row,wavelength_um,flux,flux_err"];
    for (const s of result.samples) {
      lines.push(`${s.row},${s.wavelength_um ?? ""},${s.flux},${s.flux_err ?? ""}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spectrum_${cutoutId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const obsOfCutout = (id: number) =>
    selected.find((o) => o.id === cutouts.find((c) => c.cutout_id === id)?.observation_id);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-3 md:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-starlight">
          Spectral Lab{" "}
          <span className="text-xs font-normal text-mutedstar">
            102 canales SPHEREx (0.75–5 µm) · perfiles medidos, no simulados
          </span>
        </h1>
        <div className="flex items-center gap-1.5">
          <select
            value={cutoutId}
            onChange={(e) => setCutoutId(e.target.value === "" ? "" : Number(e.target.value))}
            className="rounded border border-line bg-deep px-2 py-1.5 text-xs"
            aria-label="Elegir recorte"
          >
            <option value="">— recorte —</option>
            {cutouts.map((c) => {
              const o = obsOfCutout(c.cutout_id);
              return (
                <option key={c.cutout_id} value={c.cutout_id}>
                  {o?.date_obs || mjdToDate(o?.t_min_mjd ?? null)} · det {o?.detector || "—"}
                </option>
              );
            })}
          </select>
          <button
            onClick={() => void run()}
            disabled={!target || cutoutId === "" || busy}
            className="flex items-center gap-1.5 rounded bg-pulse px-3 py-1.5 text-xs font-bold text-abyss hover:brightness-110 disabled:opacity-40"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : null} Extraer espectro
          </button>
          <button
            onClick={exportCsv}
            disabled={!result}
            className="flex items-center gap-1.5 rounded border border-line px-3 py-1.5 text-xs disabled:opacity-40"
          >
            <Download size={13} /> CSV
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {cutouts.length === 0 && (
        <p className="mt-4 text-sm text-mutedstar">
          Prepara recortes en Time Explorer para extraer un espectro medido.
        </p>
      )}

      {result && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mutedstar">
          <span>Detector <b className="text-starlight">{result.detector || "—"}</b></span>
          <span>Banda <b className="text-starlight">{result.band || "—"}</b></span>
          <span>Fecha <b className="text-starlight">{result.date_obs || "—"}</b></span>
          <span>Muestras <b className="text-starlight">{result.n_samples}</b></span>
          {mode === "investigate" && (
            <span>Clase <b className="text-starlight">{result.data_class}</b></span>
          )}
        </div>
      )}

      <div className="rounded border border-line bg-deep">
        <div ref={plotRef} style={{ width: "100%", height: 420 }} />
        {(!result || result.samples.length === 0) && (
          <p className="p-4 text-center text-xs text-mutedstar">
            Sin muestras no hay curva. Ejecuta una extracción sobre un recorte real.
          </p>
        )}
      </div>

      {result && result.limitations.length > 0 && (
        <div className="mt-2 rounded border border-line bg-deep p-2 text-[11px]">
          <p className="flex items-center gap-1 font-semibold text-gold">
            <TriangleAlert size={12} /> Calidad y limitaciones
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {result.limitations.map((l, i) => (
              <li key={i} className="text-mutedstar">· {l}</li>
            ))}
          </ul>
          <p className="mt-1 text-mutedstar/70">
            Este laboratorio no identifica moléculas: cualquier interpretación física requiere
            modelos y referencias apropiadas.
          </p>
        </div>
      )}
    </div>
  );
}
