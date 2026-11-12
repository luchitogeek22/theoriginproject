"use client";

/** Manual A/B comparison of raw cutouts plus the aligned differential analysis.
 * Blinking/overlay is display only and labeled as uncalibrated. */

import { useEffect, useMemo, useState } from "react";
import {
  GitCompare,
  Loader2,
  Pause,
  Play,
  Scissors,
  TriangleAlert,
} from "lucide-react";
import { ApiError, TemporalResult, api, apiUrl, pollJob } from "@/lib/api";
import { mjdToDate } from "@/lib/coords";
import { useResearch } from "@/lib/store";
import type { Cutout, Epoch, Observation } from "@/lib/types";

function groupEpochs(observations: Observation[]): Epoch[] {
  const map = new Map<string, Epoch>();
  for (const o of observations) {
    const key = o.date_obs || (o.t_min_mjd !== null ? `MJD ${o.t_min_mjd}` : o.obs_id);
    const label = o.date_obs || mjdToDate(o.t_min_mjd);
    if (!map.has(key)) map.set(key, { key, label, mjd: o.t_min_mjd, observations: [] });
    map.get(key)!.observations.push(o);
  }
  return [...map.values()].sort((a, b) => (a.mjd ?? 1e12) - (b.mjd ?? 1e12));
}

export default function CutoutComparison() {
  const { mode, target, selected, cutouts, addCutout, setCurrentJobId } = useResearch();
  const epochs = useMemo(() => groupEpochs(selected), [selected]);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<Array<{ obs: Observation; reason: string }>>([]);
  const CUTOUT_TIMEOUT_MS = 180000;
  const [cutA, setCutA] = useState<Cutout | null>(null);
  const [cutB, setCutB] = useState<Cutout | null>(null);
  const [playIdx, setPlayIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(1200);
  const [blend, setBlend] = useState(50);
  const [view, setView] = useState<"ab" | "overlay" | "diff">("ab");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<TemporalResult | null>(null);
  const [activeDetection, setActiveDetection] = useState<number | null>(null);

  useEffect(() => {
    if (cutouts.length >= 1 && !cutA) setCutA(cutouts[0]);
    if (cutouts.length >= 2 && !cutB) setCutB(cutouts[1]);
  }, [cutouts, cutA, cutB]);

  useEffect(() => {
    if (!playing || cutouts.length < 2) return;
    const id = setInterval(() => setPlayIdx((i) => (i + 1) % cutouts.length), speedMs);
    return () => clearInterval(id);
  }, [playing, cutouts.length, speedMs]);

  const prepareCutouts = async (only?: Observation[]) => {
    if (!target || preparing) return;
    // Each epoch is independent: one failure or timeout never blocks the rest,
    // and failures are reported honestly — never faked as success.
    const queue = (only ?? selected).filter(
      (o) => o.id !== null && !cutouts.some((c) => c.observation_id === o.id)
    );
    if (queue.length === 0) return;
    setPreparing(true);
    setError("");
    setFailed([]);
    setResult(null);
    const failures: Array<{ obs: Observation; reason: string }> = [];
    try {
      for (let i = 0; i < queue.length; i++) {
        const o = queue[i];
        setProgress(`Recorte ${i + 1}/${queue.length}: ${o.obs_id}`);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CUTOUT_TIMEOUT_MS);
        try {
          const cut = await api.createCutout(
            {
              observation_id: o.id as number,
              ra_deg: target.ra_deg,
              dec_deg: target.dec_deg,
              size_arcmin: 6,
            },
            { signal: controller.signal }
          );
          addCutout(cut);
        } catch (e) {
          const reason =
            e instanceof DOMException && e.name === "AbortError"
              ? `Tiempo agotado (${CUTOUT_TIMEOUT_MS / 1000}s) esperando a IRSA`
              : e instanceof ApiError
                ? e.message
                : "No se pudo preparar el recorte";
          failures.push({ obs: o, reason });
        } finally {
          clearTimeout(timer);
        }
      }
    } finally {
      setProgress("");
      setPreparing(false);
      setFailed(failures);
      if (failures.length > 0) {
        setError(
          `${failures.length} de ${queue.length} recortes fallaron. ` +
            `Reintenta; ningún dato fue inventado.`
        );
      }
    }
  };

  const runDifferential = async () => {
    if (!cutA || !cutB || analyzing) return;
    setAnalyzing(true);
    setError("");
    setResult(null);
    try {
      const job = await api.analyzeDifferential({ cutout_a_id: cutA.cutout_id, cutout_b_id: cutB.cutout_id });
      setCurrentJobId(job.job_id);
      const res = await pollJob<TemporalResult>(job.job_id);
      setResult(res);
      setView("diff");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "El análisis diferencial falló");
    } finally {
      setAnalyzing(false);
    }
  };

  const obsOf = (c: Cutout | null) => selected.find((o) => o.id === c?.observation_id);
  const astro = result?.astrometry;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-starlight">
          Comparación manual A/B{target && <span className="font-normal text-mutedstar"> — {target.name}</span>}
        </h2>
        <div className="flex gap-1.5">
          <button
            onClick={() => void prepareCutouts()}
            disabled={!target || selected.length === 0 || preparing}
            className="flex items-center gap-1.5 rounded border border-line px-3 py-1.5 text-xs text-starlight hover:border-pulse disabled:opacity-40"
          >
            {preparing ? <Loader2 size={13} className="animate-spin" /> : <Scissors size={13} />}
            Preparar recortes ({cutouts.length}/{selected.length})
          </button>
          <button
            onClick={() => void runDifferential()}
            disabled={!cutA || !cutB || analyzing}
            className="flex items-center gap-1.5 rounded bg-pulse px-3 py-1.5 text-xs font-bold text-abyss hover:brightness-110 disabled:opacity-40"
          >
            {analyzing ? <Loader2 size={13} className="animate-spin" /> : <GitCompare size={13} />}
            Análisis diferencial
          </button>
        </div>
      </div>
      {progress && <p className="text-xs text-pulse">{progress}</p>}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
      {failed.length > 0 && (
        <div className="mt-1 rounded border border-red-400/40 bg-deep p-2 text-[11px]">
          <p className="font-semibold text-red-300">Recortes fallidos ({failed.length})</p>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {failed.map((f, i) => (
              <li key={i} className="truncate text-mutedstar">
                · {f.obs.obs_id || f.obs.date_obs}: {f.reason}
              </li>
            ))}
          </ul>
          <button
            onClick={() => void prepareCutouts(failed.map((f) => f.obs))}
            disabled={preparing}
            className="mt-1.5 rounded border border-line px-2 py-1 text-starlight hover:border-pulse disabled:opacity-40"
          >
            Reintentar fallidos
          </button>
        </div>
      )}

      {selected.length === 0 && (
        <p className="mt-4 text-sm text-mutedstar">
          Selecciona observaciones en el Cielo vivo para preparar recortes y compararlos.
        </p>
      )}

      {epochs.length > 0 && (
        <section className="mb-3">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-mutedstar">Épocas reales</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {epochs.map((e, i) => (
              <div key={e.key} className={`shrink-0 rounded border p-2 text-[11px] ${playIdx === i ? "border-pulse" : "border-line"}`}>
                <p className="font-semibold text-starlight">{e.label}</p>
                <p className="text-mutedstar">{e.observations.length} obs · {e.observations[0]?.collection}</p>
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-mutedstar">
            <button
              onClick={() => setPlaying((p) => !p)}
              disabled={cutouts.length < 2}
              className="flex items-center gap-1 rounded border border-line px-2 py-1 disabled:opacity-40"
              aria-label={playing ? "Pausar" : "Reproducir"}
            >
              {playing ? <Pause size={12} /> : <Play size={12} />} {playing ? "Pausar" : "Reproducir"}
            </button>
            <label className="flex items-center gap-1">
              Velocidad
              <select value={speedMs} onChange={(e) => setSpeedMs(Number(e.target.value))} className="rounded border border-line bg-deep px-1 py-0.5">
                <option value={2000}>0.5×</option>
                <option value={1200}>1×</option>
                <option value={600}>2×</option>
              </select>
            </label>
            <span className="text-mutedstar/70">Parpadeo de previsualizaciones (sin alinear — solo visual).</span>
          </div>
        </section>
      )}

      {cutouts.length > 0 && (
        <section className="mb-3 grid gap-2 md:grid-cols-[1fr_220px]">
          <div>
            <div className="mb-1 flex gap-1 text-[11px]">
              {(["ab", "overlay", "diff"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  disabled={v === "diff" && !result}
                  className={`rounded px-2 py-1 ${view === v ? "bg-panel text-pulse" : "text-mutedstar"} disabled:opacity-40`}
                >
                  {v === "ab" ? "Antes / Después" : v === "overlay" ? "Superposición" : "Diferencia (medida)"}
                </button>
              ))}
            </div>

            {view === "ab" && (
              <div className="grid grid-cols-2 gap-2">
                {[{ c: cutA, set: setCutA, tag: "Antes · A" }, { c: cutB, set: setCutB, tag: "Después · B" }].map(({ c, set, tag }, i) => (
                  <div key={i} className="rounded border border-line bg-deep p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-starlight">{tag}</p>
                      <select
                        value={c?.cutout_id ?? ""}
                        onChange={(e) => set(cutouts.find((k) => k.cutout_id === Number(e.target.value)) ?? null)}
                        className="rounded border border-line bg-abyss px-1 py-0.5 text-[11px]"
                        aria-label={`Elegir recorte ${tag}`}
                      >
                        {cutouts.map((k) => (
                          <option key={k.cutout_id} value={k.cutout_id}>
                            {obsOf(k)?.date_obs || mjdToDate(obsOf(k)?.t_min_mjd ?? null)} · {obsOf(k)?.collection}
                          </option>
                        ))}
                      </select>
                    </div>
                    {c?.preview_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={apiUrl(c.preview_url)} alt={`Previsualización ${tag}`} className="w-full rounded" />
                    ) : (
                      <p className="text-[11px] text-mutedstar">Sin previsualización.</p>
                    )}
                    <p className="mt-1 text-[10px] text-mutedstar/70">det {obsOf(c)?.detector || "—"} · {obsOf(c)?.band || "—"}</p>
                    {c?.warning ? (
                      <p className="mt-0.5 text-[10px] text-gold">{c.warning}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {view === "overlay" && cutA?.preview_url && cutB?.preview_url && (
              <div className="rounded border border-line bg-deep p-2">
                <div className="relative mx-auto max-w-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={apiUrl(cutA.preview_url)} alt="Época A" className="w-full rounded" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={apiUrl(cutB.preview_url)} alt="Época B superpuesta" className="absolute inset-0 w-full rounded" style={{ opacity: blend / 100 }} />
                </div>
                <label className="mt-2 flex items-center gap-2 text-[11px] text-mutedstar">
                  Mezcla A/B
                  <input type="range" min={0} max={100} value={blend} onChange={(e) => setBlend(Number(e.target.value))} className="flex-1" aria-label="Mezcla A/B" />
                  {blend}%
                </label>
                <p className="mt-1 text-[10px] text-gold">Superposición visual sin alineación: no es una medición.</p>
              </div>
            )}

            {view === "diff" && result && (
              <div className="grid gap-2 md:grid-cols-3">
                {(["a_png", "b_png", "diff_png"] as const).map((name) => (
                  <div key={name} className="rounded border border-line bg-deep p-2">
                    <p className="mb-1 text-[11px] font-semibold text-starlight">
                      {name === "a_png" ? "A (alineada)" : name === "b_png" ? "B (realineada)" : "Diferencia A−B"}
                    </p>
                    {result.artifacts?.[name] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={apiUrl(result.artifacts[name])} alt={name} className="w-full rounded" />
                    ) : (
                      <p className="text-[11px] text-mutedstar">Artefacto no disponible.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {view === "diff" && result && (
              <p className="mt-1 text-[10px] text-mutedstar/70">
                Diferencia: rojo = más brillo en A, azul = más brillo en B (tras alinear y igualar fondo).
              </p>
            )}
          </div>

          <div className="rounded border border-line bg-deep p-2 text-[11px]">
            <h3 className="mb-1 font-semibold text-starlight">Qué cambió</h3>
            {!result && <p className="text-mutedstar">Ejecuta el análisis diferencial para medir cambios reales.</p>}
            {result && (
              <>
                <p className="text-mutedstar">
                  {mode === "explore"
                    ? result.detections.length === 0
                      ? "No se detectaron cambios significativos entre ambas imágenes."
                      : `Se marcan ${result.detections.length} posibles cambios. Cada marca es un candidato por validar.`
                    : `${result.detections.length} detecciones ≥ umbral · fracción válida ${(result.valid_fraction * 100).toFixed(1)}% · alineado: ${result.aligned ? "WCS" : "NO (solo visual)"}`}
                </p>
                {astro?.measured && (
                  <p className="mt-1 text-mutedstar">
                    Desplazamiento: {astro.separation_arcsec?.toFixed(2)}″ ± {astro.separation_err_arcsec?.toFixed(2) ?? "?"}″
                  </p>
                )}
                <ul className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {result.detections.map((d) => (
                    <li key={d.label}>
                      <button
                        onClick={() => setActiveDetection(activeDetection === d.label ? null : d.label)}
                        className={`w-full rounded border p-1.5 text-left ${activeDetection === d.label ? "border-pulse" : "border-line"}`}
                      >
                        <span className="text-starlight">Marca #{d.label}</span>
                        <span className="ml-1 text-mutedstar">SNR {d.peak_snr.toFixed(1)} · {d.npixels} px</span>
                        {activeDetection === d.label && (
                          <span className="block text-mutedstar/80">
                            centroide ({d.x_centroid.toFixed(1)}, {d.y_centroid.toFixed(1)}) · {d.classification}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {result.limitations.length > 0 && (
                  <div className="mt-2 border-t border-line pt-1">
                    <p className="flex items-center gap-1 font-semibold text-gold"><TriangleAlert size={12} /> Limitaciones</p>
                    <ul className="mt-0.5 flex flex-col gap-0.5">
                      {result.limitations.map((l, i) => (
                        <li key={i} className="text-mutedstar">· {l}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
