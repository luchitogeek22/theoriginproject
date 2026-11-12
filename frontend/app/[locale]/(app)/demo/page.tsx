"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, TriangleAlert } from "lucide-react";
import BeforeAfter, { MotionSentence } from "@/components/BeforeAfter";
import JobProgress from "@/components/JobProgress";
import LightCurve from "@/components/LightCurve";
import SequencePlayer from "@/components/SequencePlayer";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { sequenceJobKey, sequenceUrl, targetSequenceRequest } from "@/lib/sequenceParams";
import { VALIDATION_TARGETS } from "@/lib/targets";
import type { SequenceResult } from "@/lib/types";
import { useJob } from "@/lib/useJob";

type StepView = "before-after" | "light-curve" | "stack";

interface DemoStep {
  id: "moves" | "pulses" | "planetX";
  targetKey: string;
  view: StepView;
}

const STEPS: DemoStep[] = [
  { id: "moves", targetKey: "barnard", view: "before-after" },
  { id: "pulses", targetKey: "rdra", view: "light-curve" },
  { id: "planetX", targetKey: "wise0855", view: "stack" },
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
  const t = useTranslations("demoPage");
  const tc = useTranslations("common");
  const target = VALIDATION_TARGETS.find((t) => t.key === step.targetKey);
  const request = useMemo(() => (target ? targetSequenceRequest(target, target.mode) : null), [target]);
  const key = request ? sequenceJobKey(request) : null;
  const job = useJob<SequenceResult>(key, (signal) => {
    if (!request) throw new Error("Unknown target.");
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
          <p>{t("cancelled")}</p>
          <button
            type="button"
            onClick={job.retry}
            className="mt-2 rounded bg-pulse px-3 py-1 font-bold text-starlight hover:brightness-110"
          >
            {t("requestAgain")}
          </button>
        </section>
      )}
      {job.phase === "failed" && (
        <section role="alert" className="mb-3 max-w-xl rounded border border-red-400/40 bg-deep p-3 text-xs">
          <p className="flex items-center gap-1 font-semibold text-red-300">
            <TriangleAlert size={13} /> {t("failedTitle")}
          </p>
          <p className="mt-1 text-mutedstar">{job.error}</p>
          <button
            type="button"
            onClick={job.retry}
            className="mt-2 rounded border border-line px-3 py-1 text-starlight hover:border-pulse"
          >
            {tc("retry")}
          </button>
        </section>
      )}
      {result && result.frames.length === 0 && (
        <p className="text-xs text-mutedstar">{t("noExposures")}</p>
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
                className="mx-auto mt-3 block w-fit rounded bg-pulse px-3 py-2 text-xs font-bold text-starlight hover:brightness-110"
              >
                {t("openExplorer")}
              </Link>
              <p className="mx-auto mt-1 max-w-[560px] text-center text-[10px] text-mutedstar">
                {t("stackHint")}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function DemoPage() {
  const t = useTranslations("demoPage");
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
      <h1 className="text-lg font-bold text-starlight">{t("title")}</h1>
      <ol className="mt-2 flex flex-wrap gap-2 text-[11px]" aria-label={t("stepsLabel")}>
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
              {i + 1}. {t(`steps.${s.id}.title`)}
            </button>
          </li>
        ))}
      </ol>

      <section className="mt-3" aria-labelledby="demo-step-title">
        <p className="text-[11px] text-mutedstar">
          {t("stepOf", { current: current + 1, total: STEPS.length })}
        </p>
        <h2 id="demo-step-title" className="text-xl font-bold text-starlight" data-testid="demo-step-title">
          {t(`steps.${step.id}.title`)}
        </h2>
        <p className="mt-1 max-w-xl text-sm text-mutedstar">{t(`steps.${step.id}.sentence`)}</p>
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
          <ArrowLeft size={13} /> {t("previous")}
        </button>
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.min(STEPS.length - 1, c + 1))}
          disabled={current === STEPS.length - 1}
          data-testid="demo-next"
          className="flex items-center gap-1 rounded bg-pulse px-3 py-1.5 text-xs font-bold text-starlight hover:brightness-110 disabled:opacity-40"
        >
          {t("next")} <ArrowRight size={13} />
        </button>
        <span className="text-[10px] text-mutedstar">{t("arrowsHint")}</span>
      </div>
    </div>
  );
}
