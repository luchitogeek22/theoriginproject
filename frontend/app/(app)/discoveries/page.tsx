"use client";

/** DISCOVERIES — measured candidate tracking. Everything is a "possible
 * candidate" until validated; every row links to its job and observations. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Crosshair, Loader2 } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { useResearch } from "@/lib/store";
import type { Candidate } from "@/lib/types";

const KINDS = [
  "all",
  "possible moving source",
  "variable source",
  "possible transient",
  "persistent source",
  "instrumental artifact",
  "unclassified",
];

export default function Discoveries() {
  const router = useRouter();
  const { candidates, setCandidates, requestFocus } = useResearch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState<Candidate | null>(null);

  useEffect(() => {
    api
      .candidates()
      .then((rows) => {
        setCandidates(rows);
        const wanted = sessionStorage.getItem("origin-candidate");
        if (wanted) {
          const found = rows.find((r) => String(r.id) === wanted);
          if (found) setActive(found);
          sessionStorage.removeItem("origin-candidate");
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load candidates"))
      .finally(() => setLoading(false));
  }, [setCandidates]);

  const rows = filter === "all" ? candidates : candidates.filter((c) => c.kind === filter);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-3 md:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-starlight">
          Discoveries{" "}
          <span className="text-xs font-normal text-mutedstar">
            posibles candidatos medidos — ninguno es un descubrimiento confirmado
          </span>
        </h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded border border-line bg-deep px-2 py-1.5 text-xs"
          aria-label="Filtrar por categoría"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>{k === "all" ? "Todas las categorías" : k}</option>
          ))}
        </select>
      </div>
      {loading && <p className="flex items-center gap-1 text-xs text-mutedstar"><Loader2 size={13} className="animate-spin" /> Cargando…</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}

      {!loading && rows.length === 0 && (
        <div className="mt-6 max-w-lg text-sm text-mutedstar">
          <p className="font-semibold text-starlight">Aún no hay candidatos.</p>
          <p className="mt-1">
            Los candidatos aparecen aquí solo cuando el motor científico mide algo en
            imágenes reales (Time Explorer → Análisis diferencial). Esta plataforma no
            inventa detecciones: sin medición no hay candidato.
          </p>
        </div>
      )}

      <div className="grid gap-2 lg:grid-cols-[1fr_320px]">
        <ul className="flex flex-col gap-1.5">
          {rows.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setActive(active?.id === c.id ? null : c)}
                className={`w-full rounded border p-2 text-left text-[11px] ${active?.id === c.id ? "border-pulse" : "border-line hover:border-pulse/50"}`}
              >
                <span className="font-semibold text-starlight">Candidato #{c.id}</span>
                <span className="ml-2 rounded border border-line px-1 text-gold">{c.kind}</span>
                <span className="ml-2 text-mutedstar">
                  {c.ra_deg.toFixed(5)}°, {c.dec_deg.toFixed(5)}°
                </span>
                <span className="ml-2 text-mutedstar">
                  {c.separation_arcsec !== null && c.separation_arcsec !== undefined
                    ? `Δ ${c.separation_arcsec.toFixed(2)}″±${c.separation_err_arcsec?.toFixed(2) ?? "?"}` : ""}
                  {c.snr !== null && c.snr !== undefined ? ` · SNR ${c.snr.toFixed(1)}` : ""}
                  {` · ${c.quality}`}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {active && (
          <div className="h-fit rounded border border-line bg-deep p-3 text-[11px]">
            <p className="font-semibold text-starlight">Candidato #{active.id} — {active.kind}</p>
            <p className="mt-1 text-mutedstar">Posición: {active.ra_deg.toFixed(6)}°, {active.dec_deg.toFixed(6)}°</p>
            <p className="text-mutedstar">Trabajo: {active.job_id}</p>
            <p className="text-mutedstar">
              Obs A/B: {String((active.evidence as Record<string, unknown>)?.obs_a ?? "—")} /{" "}
              {String((active.evidence as Record<string, unknown>)?.obs_b ?? "—")}
            </p>
            {active.separation_arcsec !== null && active.separation_arcsec !== undefined && (
              <p className="text-mutedstar">Desplazamiento: {active.separation_arcsec.toFixed(3)}″ ± {active.separation_err_arcsec?.toFixed(3) ?? "?"}″</p>
            )}
            {active.snr !== null && active.snr !== undefined && (
              <p className="text-mutedstar">SNR: {active.snr.toFixed(2)}</p>
            )}
            <p className="text-mutedstar">Calidad: {active.quality}</p>
            <details className="mt-1">
              <summary className="cursor-pointer text-pulse">Evidencia (JSON)</summary>
              <pre className="scroll-thin mt-1 max-h-48 overflow-auto rounded bg-abyss p-2 text-[10px] text-mutedstar">
                {JSON.stringify(active.evidence, null, 1)}
              </pre>
            </details>
            <button
              onClick={() => {
                requestFocus(active.ra_deg, active.dec_deg);
                router.push("/living-sky");
              }}
              className="mt-2 flex items-center gap-1 rounded border border-line px-2 py-1.5 text-starlight hover:border-pulse"
            >
              <Crosshair size={13} /> Ver en la esfera celeste
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
