"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, TriangleAlert } from "lucide-react";
import BeforeAfter, { MotionSentence } from "@/components/BeforeAfter";
import JobProgress from "@/components/JobProgress";
import LightCurve from "@/components/LightCurve";
import SequencePlayer from "@/components/SequencePlayer";
import { api } from "@/lib/api";
import { sequenceJobKey, sequenceUrl, targetSequenceRequest } from "@/lib/sequenceParams";
import { VALIDATION_TARGETS } from "@/lib/targets";
import type { SequenceResult } from "@/lib/types";
import { useJob } from "@/lib/useJob";

type StepView = "before-after" | "light-curve" | "stack";

interface DemoStep {
  id: string;
  targetKey: string;
  title: string;
  sentence: string;
  view: StepView;
}

const STEPS: DemoStep[] = [
  {
    id: "moves",
    targetKey: "barnard",
    title: "Mira cómo se mueve",
    sentence:
      "La estrella de Barnard es la que más rápido cruza el cielo: compara su posición en la primera y la última época.",
    view: "before-after",
  },
  {
    id: "pulses",
    targetKey: "rdra",
    title: "Mira cómo late",
    sentence: "R Draconis es una estrella que respira: su brillo sube y baja a lo largo de las exposiciones.",
    view: "light-curve",
  },
  {
    id: "planet-x",
    targetKey: "wise0855",
    title: "Así se buscaría un Planeta X",
    sentence:
      "WISE 0855 es un objeto frío y tenue que se mueve: así se vería en la secuencia, y el apilado lo hace aparecer al sumar cuadros.",
    view: "stack",
  },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

function StepResult({ step }: { step: DemoStep }) {
  const target = VALIDATION_TARGETS.find((t) => t.key === step.targetKey);
  const request = useMemo(() => (target ? targetSequenceRequest(target, target.mode) : null), [target]);
  const key = request ? sequenceJobKey(request) : null;
  const job = useJob<SequenceResult>(key, (signal) => {
    if (!request) throw new Error("Objetivo desconocido.");
    return api.createSequence(request, { signal });
  });

  if (!target) return null;
  const result = job.phase === "completed" ? job.result : null;
  const busy = job.phase === "creating" || job.phase === "running";

  return (
    <div aria-live="polite">
      {busy && <JobProgress job={job.job} onCancel={job.cancel} />}
      {job.phase === "cancelled" && (
        <section className="mb-3 max-w-xl rounded border border-line bg-deep p-3 text-xs text-mutedstar">
          <p>Dejaste de esperar esta secuencia.</p>
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
          <p className="mt-1 text-mutedstar">{job.error}</p>
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
        <p className="text-xs text-mutedstar">El archivo no tiene exposiciones que cubran este objetivo.</p>
      )}
      {result && result.frames.length > 0 && (
        <>
          {step.view === "before-after" && (
            <>
              <MotionSentence result={result} />
              <BeforeAfter result={result} />
            </>
          )}
          {step.view === "light-curve" && (
            <div className="grid gap-3 xl:grid-cols-2">
              {result.lightcurve && <LightCurve curve={result.lightcurve} />}
              <SequencePlayer key={job.job?.job_id} result={result} exportName={`origin-${target.key}`} />
            </div>
          )}
          {step.view === "stack" && (
            <>
              <SequencePlayer key={job.job?.job_id} result={result} exportName={`origin-${target.key}`} />
              <Link
                href={sequenceUrl(target, undefined, target.mode)}
                data-testid="demo-open-explorer"
                className="mx-auto mt-3 block w-fit rounded bg-pulse px-3 py-2 text-xs font-bold text-abyss hover:brightness-110"
              >
                Abrir WISE 0855 en el Explorador temporal para apilar los cuadros
              </Link>
              <p className="mx-auto mt-1 max-w-[560px] text-center text-[10px] text-mutedstar">
                Allí, en «Apilado y búsqueda de un Planeta X», se suman los cuadros siguiendo su movimiento.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function DemoPage() {
  const [current, setCurrent] = useState(0);
  const step = STEPS[current];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      if (e.key === "ArrowRight") setCurrent((c) => Math.min(STEPS.length - 1, c + 1));
      else if (e.key === "ArrowLeft") setCurrent((c) => Math.max(0, c - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-3 md:p-4" data-testid="demo-page">
      <h1 className="text-lg font-bold text-starlight">Demo guiada en tres pasos</h1>
      <ol className="mt-2 flex flex-wrap gap-2 text-[11px]" aria-label="Pasos de la demo">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setCurrent(i)}
              aria-current={i === current ? "step" : undefined}
              data-testid={`demo-step-${i + 1}`}
              className={`rounded border px-2.5 py-1 ${
                i === current ? "border-pulse text-pulse" : "border-line text-mutedstar hover:text-starlight"
              }`}
            >
              {i + 1}. {s.title}
            </button>
          </li>
        ))}
      </ol>

      <section className="mt-3" aria-labelledby="demo-step-title">
        <p className="text-[11px] text-mutedstar">
          Paso {current + 1} de {STEPS.length}
        </p>
        <h2 id="demo-step-title" className="text-xl font-bold text-starlight" data-testid="demo-step-title">
          {step.title}
        </h2>
        <p className="mt-1 max-w-xl text-sm text-mutedstar">{step.sentence}</p>
        <div className="mt-3">
          <StepResult key={step.id} step={step} />
        </div>
      </section>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          data-testid="demo-prev"
          className="flex items-center gap-1 rounded border border-line px-3 py-1.5 text-xs text-starlight hover:border-pulse disabled:opacity-40"
        >
          <ArrowLeft size={13} /> Anterior
        </button>
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.min(STEPS.length - 1, c + 1))}
          disabled={current === STEPS.length - 1}
          data-testid="demo-next"
          className="flex items-center gap-1 rounded bg-pulse px-3 py-1.5 text-xs font-bold text-abyss hover:brightness-110 disabled:opacity-40"
        >
          Siguiente <ArrowRight size={13} />
        </button>
        <span className="text-[10px] text-mutedstar">Flechas ← → también cambian de paso.</span>
      </div>
    </div>
  );
}
