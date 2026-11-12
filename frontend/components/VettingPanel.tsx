"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import type { VetCategory, VetResult, VetStatus } from "@/lib/types";

const CATEGORY_STYLE: Record<VetCategory, { text: string; border: string; label: string }> = {
  known_object: { text: "text-sky-300", border: "border-sky-400/60", label: "Objeto conocido" },
  artifact_likely: { text: "text-orange-300", border: "border-orange-400/60", label: "Artefacto probable" },
  unexplained_candidate: { text: "text-violet-300", border: "border-violet-400/60", label: "Candidato sin explicar" },
  inconclusive: { text: "text-mutedstar", border: "border-line", label: "No concluyente: alguna comprobación no se pudo ejecutar" },
};

const STATUS_STYLE: Record<VetStatus, { chip: string; label: string }> = {
  pass: { chip: "border-emerald-400/60 text-emerald-300", label: "pasa" },
  fail: { chip: "border-red-400/60 text-red-300", label: "falla" },
  info: { chip: "border-sky-400/60 text-sky-300", label: "informativa" },
  not_checked: { chip: "border-line text-mutedstar", label: "no comprobada" },
};

const CHECK_LABELS: Record<string, string> = {
  gaia_star: "Estrella de Gaia",
  solar_system: "Objeto del Sistema Solar",
  quality_flags: "Banderas de calidad",
  visits: "Detección en varias visitas",
  coherent_motion: "Movimiento coherente",
  point_source: "Fuente puntual",
  colour: "Color",
};

export default function VettingPanel({ candidateId }: { candidateId: number }) {
  const [result, setResult] = useState<VetResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setResult(null);
    api
      .vetCandidate(candidateId, { signal: controller.signal })
      .then(setResult)
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(e instanceof ApiError ? e.message : "No se pudo verificar el candidato");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [candidateId]);

  const style = result ? CATEGORY_STYLE[result.category] : null;

  return (
    <div className="mt-2 rounded border border-line bg-abyss p-2" aria-live="polite" aria-busy={busy}>
      <p className="font-semibold text-starlight">Verificación del candidato #{candidateId}</p>
      {busy && (
        <p className="mt-1 flex items-center gap-1 text-mutedstar">
          <Loader2 size={12} className="animate-spin" /> Consultando catálogos y comprobando la señal…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-red-300">
          {error}
        </p>
      )}
      {result && style && (
        <>
          <p className={`mt-1 rounded border px-2 py-1 font-semibold ${style.text} ${style.border}`}>
            {style.label}
            <span className="sr-only"> ({result.category_label})</span>
          </p>
          <p className="mt-1 text-mutedstar">{result.reason}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {result.checks.map((c) => {
              const st = STATUS_STYLE[c.status] ?? STATUS_STYLE.not_checked;
              return (
                <li key={c.name}>
                  <span className="font-semibold text-starlight">{CHECK_LABELS[c.name] ?? c.name}</span>
                  <span className={`ml-2 rounded border px-1 text-[10px] ${st.chip}`}>{st.label}</span>
                  <span className="block text-mutedstar">{c.summary}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[10px] text-mutedstar/80">
            Una categoría no es una confirmación: es el resultado de siete comprobaciones automáticas. Lo que no se
            pudo comprobar nunca se cuenta a favor del candidato.
          </p>
        </>
      )}
    </div>
  );
}
