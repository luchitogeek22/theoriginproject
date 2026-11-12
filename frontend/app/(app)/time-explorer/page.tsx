"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import CutoutComparison from "@/components/CutoutComparison";
import Explainer from "@/components/Explainer";
import Glossary from "@/components/Glossary";
import LightCurve from "@/components/LightCurve";
import SearchBar from "@/components/SearchBar";
import SequencePlayer from "@/components/SequencePlayer";
import ShiftStackPanel from "@/components/ShiftStackPanel";
import { ApiError, api } from "@/lib/api";
import {
  FOV_OPTIONS_ARCMIN,
  freeTextQuery,
  parseFrameParam,
  parseSequenceState,
  sequenceStateUrl,
} from "@/lib/sequenceParams";
import { useResearch } from "@/lib/store";
import type { SequenceMode, SequenceRequest, SequenceResult } from "@/lib/types";
import { useJob } from "@/lib/useJob";

const AladinViewer = dynamic(() => import("@/components/AladinViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-mutedstar">Cargando mapa del cielo…</div>
  ),
});

const MODES: Array<{ value: SequenceMode; label: string; help: string }> = [
  { value: "motion", label: "Movimiento", help: "Cada cuadro se normaliza por separado: realza desplazamientos." },
  { value: "brightness", label: "Brillo", help: "Escala común a todos los cuadros: el brillo es comparable." },
];

const STAGE_LABELS: Record<string, string> = {
  queued: "En cola",
  searching: "Buscando observaciones en el archivo",
  downloading: "Descargando recortes",
  processing: "Procesando cuadros",
  rendering: "Generando imágenes",
};

function friendlyError(status: number | null, message: string): string {
  if (status === 429) {
    return "El servicio está procesando otras secuencias y no admite más por ahora. Espera unos segundos y reintenta.";
  }
  return message;
}

function Explorer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { target, setTarget } = useResearch();
  const embed = searchParams.get("embed") === "1";
  const query = useMemo(() => freeTextQuery(new URLSearchParams(searchParams.toString())), [searchParams]);
  const params = useMemo(
    () => (query ? null : parseSequenceState(new URLSearchParams(searchParams.toString()))),
    [query, searchParams]
  );
  const initialFrame = useMemo(() => parseFrameParam(searchParams.get("frame")), [searchParams]);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");

  useEffect(() => {
    if (!query) {
      setResolveError("");
      return;
    }
    let cancelled = false;
    setResolving(true);
    setResolveError("");
    api
      .resolveTarget({ query })
      .then((t) => {
        if (cancelled) return;
        setTarget(t);
        const current = new URLSearchParams(window.location.search);
        const probe = new URLSearchParams(current);
        probe.set("ra", String(t.propagated_ra_deg ?? t.ra_deg));
        probe.set("dec", String(t.propagated_dec_deg ?? t.dec_deg));
        const state = parseSequenceState(probe);
        if (!state) {
          setResolveError("Las coordenadas resueltas no son válidas.");
          return;
        }
        router.replace(
          sequenceStateUrl(
            { ...state, name: t.name.slice(0, 80) },
            { frame: parseFrameParam(current.get("frame")), embed: current.get("embed") === "1" }
          ),
          { scroll: false }
        );
      })
      .catch((e) => {
        if (!cancelled) setResolveError(e instanceof ApiError ? e.message : "No se pudo interpretar la búsqueda.");
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const request = useMemo<SequenceRequest | null>(
    () =>
      params && {
        ra_deg: params.ra,
        dec_deg: params.dec,
        size_arcmin: params.fov,
        mode: params.mode,
        ...(params.detector ? { detector: params.detector } : {}),
        ...(params.reference ? { include_reference: true } : {}),
      },
    [params]
  );
  const key = request
    ? `sequence|${request.ra_deg.toFixed(6)}|${request.dec_deg.toFixed(6)}|${request.size_arcmin}|${request.mode}|${request.detector ?? ""}|${request.include_reference ? "ref" : ""}`
    : null;

  const job = useJob<SequenceResult>(key, (signal) => {
    if (!request) throw new Error("Faltan coordenadas.");
    return api.createSequence(request, { signal });
  });

  const update = useCallback(
    (changes: Record<string, string>) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("frame");
      for (const [k, v] of Object.entries(changes)) next.set(k, v);
      router.replace(`/time-explorer?${next.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const marker = useMemo(() => {
    if (!params) return null;
    const matches =
      target &&
      Math.abs((target.propagated_ra_deg ?? target.ra_deg) - params.ra) < 1e-4 &&
      Math.abs((target.propagated_dec_deg ?? target.dec_deg) - params.dec) < 1e-4;
    const name = (matches ? target?.name : params.name) || "objetivo";
    const propagated = matches && target?.propagated_ra_deg != null;
    return {
      name,
      ra: params.ra,
      dec: params.dec,
      label: propagated
        ? `${name}: posición propagada a ${target?.propagated_epoch ?? "la época de observación"}`
        : `${name}: posición pedida`,
    };
  }, [params, target]);

  if (!params || !request) {
    return (
      <div className="scroll-thin h-full overflow-y-auto p-3 md:p-4">
        <h1 className="text-lg font-bold text-starlight">Explorador temporal</h1>
        {resolving && (
          <p role="status" className="mt-1 flex items-center gap-2 text-sm text-mutedstar">
            <Loader2 size={14} className="animate-spin text-pulse" /> Interpretando «{query}»…
          </p>
        )}
        {resolveError && (
          <p role="alert" className="mt-1 max-w-xl text-sm text-red-300">
            No se pudo interpretar «{query}»: {resolveError} Escribe un nombre conocido o coordenadas como «08h55m10.831s -7d14m42.53s».
          </p>
        )}
        <p className="mt-1 max-w-xl text-sm text-mutedstar">
          {!query && (searchParams.get("ra") || searchParams.get("dec"))
            ? "Las coordenadas de la dirección no son válidas (RA entre 0 y 360°, Dec entre −90 y 90°). "
            : ""}
          Busca un objetivo o elige uno de prueba para ver cómo cambia su campo entre exposiciones de SPHEREx.
        </p>
        <div className="mt-3">
          <SearchBar />
        </div>
      </div>
    );
  }

  const title = marker?.name ?? "objetivo";
  const result = job.phase === "completed" ? job.result : null;
  const busy = job.phase === "creating" || job.phase === "running";
  const total = job.job?.total ?? 0;
  const done = job.job?.done ?? 0;
  const stageLabel = job.job?.stage ? (STAGE_LABELS[job.job.stage] ?? job.job.stage) : "Enviando la petición";
  const shareUrl = (frame: number) => sequenceStateUrl(params, { frame });
  const exportName = `origin-${title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "objetivo"}`;

  return (
    <div className={`scroll-thin h-full overflow-y-auto ${embed ? "p-2" : "p-3 md:p-4"}`}>
      {embed && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-mutedstar">
          <p>
            <span className="font-semibold text-starlight">{title}</span> · campo de {params.fov}′ · exposiciones
            reales de SPHEREx
          </p>
          <a
            href={sequenceStateUrl(params)}
            target="_blank"
            rel="noopener"
            className="rounded border border-line px-2 py-1 text-pulse hover:border-pulse"
          >
            Abrir en THE ORIGIN PROJECT
          </a>
        </div>
      )}
      {!embed && (
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-starlight">
            Explorador temporal <span className="text-sm font-normal text-mutedstar">— {title}</span>
          </h1>
          <p className="text-[11px] text-mutedstar">
            {params.ra.toFixed(5)}°, {params.dec >= 0 ? "+" : ""}
            {params.dec.toFixed(5)}° · campo de {params.fov}′ · exposiciones reales de SPHEREx ordenadas por fecha
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-[11px] text-mutedstar">
          <label className="flex flex-col gap-0.5">
            Campo de visión
            <select
              value={FOV_OPTIONS_ARCMIN.includes(params.fov) ? params.fov : ""}
              onChange={(e) => update({ fov: e.target.value })}
              className="rounded border border-line bg-deep px-2 py-1.5 text-xs text-starlight"
            >
              {!FOV_OPTIONS_ARCMIN.includes(params.fov) && <option value="">{params.fov}′</option>}
              {FOV_OPTIONS_ARCMIN.map((f) => (
                <option key={f} value={f}>
                  {f}′
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="mb-0.5">Modo</legend>
            <div className="flex rounded border border-line bg-deep p-0.5">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={params.mode === m.value}
                  title={m.help}
                  onClick={() => update({ mode: m.value })}
                  className={`rounded px-2.5 py-1 text-xs ${
                    params.mode === m.value ? "bg-panel text-pulse" : "text-mutedstar hover:text-starlight"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-1.5 pb-1.5" title="Pide además un cuadro de WISE de otra época, solo como contexto visual.">
            <input
              type="checkbox"
              checked={params.reference}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams.toString());
                next.delete("frame");
                if (e.target.checked) next.set("ref", "1");
                else next.delete("ref");
                router.replace(`/time-explorer?${next.toString()}`, { scroll: false });
              }}
            />
            Incluir cuadro WISE de referencia
          </label>
        </div>
      </div>
      )}

      <div aria-live="polite">
        {busy && (
          <section className="mb-3 max-w-xl rounded border border-line bg-deep p-3 text-xs" aria-label="Progreso">
            <p className="flex items-center gap-2 text-starlight">
              <Loader2 size={14} className="animate-spin text-pulse" />
              {stageLabel}
              {total > 0 ? ` (${done} / ${total})` : ""}
            </p>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded bg-abyss"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total || 1}
              aria-valuenow={total > 0 ? done : undefined}
              aria-label="Progreso de la secuencia"
            >
              <div
                className={`h-full bg-pulse ${total > 0 ? "" : "w-1/3 animate-pulse"}`}
                style={total > 0 ? { width: `${Math.round((done / total) * 100)}%` } : undefined}
              />
            </div>
            <p className="mt-2 text-mutedstar">
              La primera vez puede tardar un par de minutos: se descargan y alinean las exposiciones. Si recargas la
              página, se recupera la misma tarea.
            </p>
            <button
              type="button"
              onClick={job.cancel}
              className="mt-2 rounded border border-line px-3 py-1 text-starlight hover:border-pulse"
            >
              Cancelar
            </button>
          </section>
        )}

        {job.phase === "cancelled" && (
          <section className="mb-3 max-w-xl rounded border border-line bg-deep p-3 text-xs text-mutedstar">
            <p>Dejaste de esperar esta secuencia. El servicio puede seguir procesándola, pero no se mostrará.</p>
            <button
              type="button"
              onClick={job.retry}
              className="mt-2 rounded bg-pulse px-3 py-1 font-bold text-abyss hover:brightness-110"
            >
              Volver a pedirla
            </button>
          </section>
        )}

        {job.phase === "failed" && (
          <section role="alert" className="mb-3 max-w-xl rounded border border-red-400/40 bg-deep p-3 text-xs">
            <p className="flex items-center gap-1 font-semibold text-red-300">
              <TriangleAlert size={13} /> No se pudo preparar la secuencia
            </p>
            <p className="mt-1 text-mutedstar">{friendlyError(job.errorStatus, job.error)}</p>
            <button
              type="button"
              onClick={job.retry}
              className="mt-2 rounded border border-line px-3 py-1 text-starlight hover:border-pulse"
            >
              Reintentar
            </button>
          </section>
        )}

        {result && result.frames.length === 0 && (
          <section className="mb-3 max-w-xl rounded border border-line bg-deep p-3 text-xs text-mutedstar">
            <p className="font-semibold text-starlight">Sin cobertura en este campo</p>
            <p className="mt-1">
              El archivo no tiene exposiciones de SPHEREx que cubran esta posición con el campo elegido
              {result.n_available > 0 ? ` (${result.n_available} candidatas descartadas por cobertura o detector)` : ""}.
              Prueba un campo mayor o otro objetivo.
            </p>
            {result.limitations.length > 0 && (
              <ul className="mt-1">
                {result.limitations.map((l, i) => (
                  <li key={i}>· {l}</li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <div className={embed ? "" : "grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]"}>
        <section aria-label="Secuencia de imágenes" className="min-w-0">
          {result && result.frames.length > 0 && (
            <SequencePlayer
              key={job.job?.job_id ?? key}
              result={result}
              fovArcmin={params.fov}
              onFovChange={(fov) => update({ fov: String(fov) })}
              initialFrame={initialFrame}
              shareUrl={shareUrl}
              exportName={exportName}
            />
          )}
        </section>
        {!embed && (
          <div className="flex min-w-0 flex-col gap-3">
            <Explainer />
            <section aria-label="Mapa del cielo" className="h-[360px] overflow-hidden rounded border border-line xl:h-[420px]">
              <AladinViewer ra={params.ra} dec={params.dec} fovArcmin={params.fov} marker={marker} />
            </section>
          </div>
        )}
      </div>

      {embed && (
        <p className="mt-2 text-center text-[10px] text-mutedstar">
          Datos: NASA/IPAC IRSA, SPHEREx · THE ORIGIN PROJECT
        </p>
      )}

      {!embed && result && result.frames.length > 0 && (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {result.lightcurve && <LightCurve curve={result.lightcurve} />}
          <ShiftStackPanel ra={params.ra} dec={params.dec} detector={params.detector} />
        </div>
      )}

      {!embed && (
        <div className="mt-4 flex flex-col gap-3">
          <Glossary />
          <details className="rounded border border-line bg-deep/60">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-mutedstar">
              Comparación manual A/B y análisis diferencial (avanzado)
            </summary>
            <div className="p-3">
              <CutoutComparison />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

export default function TimeExplorerPage() {
  return (
    <Suspense
      fallback={<div className="p-4 text-xs text-mutedstar">Cargando el explorador temporal…</div>}
    >
      <Explorer />
    </Suspense>
  );
}
