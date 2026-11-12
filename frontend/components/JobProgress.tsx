"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMotionFormat } from "@/lib/motion";
import type { JobStatus } from "@/lib/types";

export default function JobProgress({ job, onCancel }: { job: JobStatus | null; onCancel?: () => void }) {
  const t = useTranslations("jobProgress");
  const tc = useTranslations("common");
  const motion = useMotionFormat();
  const total = job?.total ?? 0;
  const done = job?.done ?? 0;
  return (
    <section
      className="mb-3 max-w-xl rounded border border-line bg-deep p-3 text-xs"
      aria-label={t("label")}
      data-testid="job-progress"
    >
      <p className="flex items-center gap-2 text-starlight">
        <Loader2 size={14} className="animate-spin text-pulse" />
        <span data-testid="job-progress-text">{motion.progress(job?.stage, done, total)}</span>
      </p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded bg-abyss"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total || 1}
        aria-valuenow={total > 0 ? done : undefined}
        aria-label={t("barLabel")}
      >
        <div
          className={`h-full bg-pulse ${total > 0 ? "" : "w-1/3 animate-pulse"}`}
          style={total > 0 ? { width: `${Math.round((done / total) * 100)}%` } : undefined}
        />
      </div>
      <p className="mt-2 text-mutedstar">{t("note")}</p>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 rounded border border-line px-3 py-1 text-starlight hover:border-pulse"
        >
          {tc("cancel")}
        </button>
      )}
    </section>
  );
}
