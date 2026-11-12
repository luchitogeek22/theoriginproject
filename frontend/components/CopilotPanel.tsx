"use client";

/** Rule-based interpretation assistant.
 * Answers ONLY from the current job's measurements and loaded metadata.
 * "MEDIDO" is reserved for values computed by the scientific engine. */

import { useState } from "react";
import { MessageCircleQuestion, Send } from "lucide-react";
import { useResearch } from "@/lib/store";

interface Answer {
  kind: "measured" | "archive" | "inferred" | "explanatory";
  text: string;
}

const SUGGESTED = [
  "¿Por qué esta estrella parece moverse?",
  "¿Qué significa una imagen diferencial?",
  "¿Cuántas observaciones se han encontrado?",
  "¿Qué indican las variaciones de brillo?",
];

function badge(kind: Answer["kind"]): string {
  if (kind === "measured") return "MEDIDO";
  if (kind === "archive") return "ARCHIVO";
  if (kind === "inferred") return "INFERENCIA";
  return "EXPLICACIÓN";
}

export default function CopilotPanel() {
  const { target, search, selected, candidates, currentJobId } = useResearch();
  const jobCandidates = currentJobId ? candidates.filter((c) => c.job_id === currentJobId) : [];
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Array<{ q: string; a: Answer[] }>>([]);

  const answer = (question: string): Answer[] => {
    const q = question.toLowerCase();
    if (q.includes("cuánt") || q.includes("observaciones se han")) {
      if (!search) {
        return [{ kind: "archive", text: "Aún no se ha consultado el archivo. Busca un objetivo para contar sus observaciones reales." }];
      }
      return [
        { kind: "archive", text: `Se encontraron ${search.count} observaciones (consulta del ${new Date(search.queried_at).toLocaleString()}${search.cached ? ", desde caché" : ""}).` },
        { kind: "explanatory", text: "Cada observación es una imagen real del archivo SPHEREx con su fecha y detector. Sin observaciones no hay comparación posible." },
      ];
    }
    if (q.includes("muev") || q.includes("moverse") || q.includes("desplaz")) {
      const astro = jobCandidates.find((c) => c.kind.includes("moving"));
      const parts: Answer[] = [
        { kind: "explanatory", text: "Un desplazamiento aparente entre dos épocas puede ser movimiento propio real, pero también un artefacto de alineación, distinta PSF o ruido." },
      ];
      if (astro?.separation_arcsec !== null && astro?.separation_arcsec !== undefined) {
        parts.unshift({ kind: "measured", text: `El motor midió ${astro.separation_arcsec.toFixed(2)}″ ± ${astro.separation_err_arcsec?.toFixed(2) ?? "?"}″ entre épocas (candidato ${astro.id}, SNR ${astro.snr?.toFixed(1) ?? "—"}).` });
        parts.push({ kind: "inferred", text: "Si el desplazamiento supera claramente su incertidumbre y se repite en más épocas, un movimiento real es una hipótesis razonable a validar." });
      } else {
        parts.unshift({ kind: "archive", text: "No hay ninguna medición de desplazamiento del análisis actual." });
      }
      return parts;
    }
    if (q.includes("diferencial")) {
      return [
        { kind: "explanatory", text: "La imagen diferencial es época A menos época B, tras alinear por WCS e igualar el fondo. Lo que brilla o se oscurece cambió entre ambas fechas." },
        { kind: "inferred", text: "Residuos brillantes aislados sugieren variabilidad o movimiento; residuos extensos suelen indicar diferencias instrumentales." },
      ];
    }
    if (q.includes("brillo") || q.includes("variaci")) {
      return [
        { kind: "explanatory", text: "Las variaciones de brillo comparan flujo calibrado (MJy/sr) entre épocas compatibles: mismo detector y respuesta espectral comparable." },
        { kind: "archive", text: target ? `Objetivo actual: ${target.name}. Las mediciones aparecen tras ejecutar un análisis temporal.` : "Sin objetivo seleccionado no hay mediciones que interpretar." },
      ];
    }
    if (q.includes("quép") || q.includes("qué estoy") || q.includes("viendo")) {
      if (!target) return [{ kind: "archive", text: "Ningún objetivo seleccionado. Busca por nombre o coordenadas para empezar." }];
      return [
        { kind: "archive", text: `Observas la región de ${target.name} (${target.ra_deg.toFixed(5)}°, ${target.dec_deg.toFixed(5)}°), resuelta por ${target.resolver || "el servicio de resolución"}.` },
        { kind: "explanatory", text: "Los contornos cian son huellas de observaciones SPHEREx reales; la estrella dorada marca tu objetivo." },
      ];
    }
    return [
      { kind: "explanatory", text: "Solo puedo responder a partir de las mediciones y metadatos cargados en esta investigación. Prueba con una de las preguntas sugeridas." },
    ];
  };

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    setHistory((h) => [...h, { q, a: answer(q) }]);
    setInput("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-starlight">
        <MessageCircleQuestion size={16} className="text-pulse" /> Asistente de interpretación
      </div>
      <p className="mb-3 text-[11px] text-mutedstar">
        Explica tus resultados. Etiqueta cada afirmación: medido (solo cálculos del motor), dato del archivo, inferencia o explicación.
      </p>
      <div className="mb-3 flex flex-1 flex-col gap-3 overflow-y-auto pr-1" style={{ maxHeight: 320 }}>
        {history.length === 0 && (
          <p className="text-xs text-mutedstar">
            {selected.length > 0
              ? `Tienes ${selected.length} observaciones seleccionadas. Pregunta por ellas.`
              : "Selecciona un objetivo y consulta el archivo; después pregúntame qué significan los resultados."}
          </p>
        )}
        {history.map((h, i) => (
          <div key={i} className="flex flex-col gap-1">
            <p className="text-xs font-medium text-starlight">{h.q}</p>
            {h.a.map((part, j) => (
              <p key={j} className="text-xs text-mutedstar">
                <span className="mr-1 rounded border border-line px-1 text-[10px] text-pulse">{badge(part.kind)}</span>
                {part.text}
              </p>
            ))}
          </div>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {SUGGESTED.map((s) => (
          <button key={s} onClick={() => ask(s)} className="rounded border border-line px-2 py-1 text-[11px] text-mutedstar hover:text-starlight">
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(input)}
          placeholder="Pregunta sobre tus resultados…"
          aria-label="Pregunta para el asistente"
          className="w-full rounded border border-line bg-deep px-2 py-1.5 text-xs text-starlight outline-none placeholder:text-mutedstar/60 focus:border-pulse"
        />
        <button onClick={() => ask(input)} aria-label="Enviar pregunta" className="rounded border border-line px-2 text-pulse hover:bg-panel">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
