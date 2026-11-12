"use client";

import { Loader2 } from "lucide-react";
import { progressText } from "@/lib/motion";
import type { JobStatus } from "@/lib/types";

export default function JobProgress({ job, onCancel }: { job: JobStatus | null; onCancel?: () => void }) {
  const total = job?.total ?? 0;
  const done = job?.done ?? 0;
  return (
    <section
      className="mb-3 max-w-xl rounded border border-line bg-deep p-3 text-xs"
      aria-label="Progreso"
      data-testid="job-progress"
    >
      <p className="flex items-center gap-2 text-starlight">
        <Loader2 size={14} className="animate-spin text-pulse" />
        <span data-testid="job-progress-text">{progressText(job?.stage, done, total)}</span>
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
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 rounded border border-line px-3 py-1 text-starlight hover:border-pulse"
        >
          Cancelar
        </button>
      )}
    </section>
  );
}
