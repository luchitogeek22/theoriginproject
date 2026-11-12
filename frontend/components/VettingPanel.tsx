"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useErrorText } from "@/lib/errors";
import type { VetCategory, VetResult, VetStatus } from "@/lib/types";

const CATEGORY_STYLE: Record<VetCategory, { text: string; border: string }> = {
  known_object: { text: "text-sky-300", border: "border-sky-400/60" },
  artifact_likely: { text: "text-orange-300", border: "border-orange-400/60" },
  unexplained_candidate: { text: "text-violet-300", border: "border-violet-400/60" },
  inconclusive: { text: "text-mutedstar", border: "border-line" },
};

const STATUS_STYLE: Record<VetStatus, string> = {
  pass: "border-emerald-400/60 text-emerald-300",
  fail: "border-red-400/60 text-red-300",
  info: "border-sky-400/60 text-sky-300",
  not_checked: "border-line text-mutedstar",
};

const CHECKS = [
  "gaia_star",
  "solar_system",
  "quality_flags",
  "visits",
  "coherent_motion",
  "point_source",
  "colour",
] as const;
type CheckName = (typeof CHECKS)[number];
const isKnownCheck = (name: string): name is CheckName => (CHECKS as readonly string[]).includes(name);

export default function VettingPanel({ candidateId }: { candidateId: number }) {
  const t = useTranslations("vettingPanel");
  const errorText = useErrorText();
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
        setError(errorText(e, t("error")));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [candidateId]);

  const style = result ? CATEGORY_STYLE[result.category] : null;

  return (
    <div className="mt-2 rounded border border-line bg-abyss p-2" aria-live="polite" aria-busy={busy}>
      <p className="font-semibold text-starlight">{t("title", { id: String(candidateId) })}</p>
      {busy && (
        <p className="mt-1 flex items-center gap-1 text-mutedstar">
          <Loader2 size={12} className="animate-spin" /> {t("loading")}
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
            {t(`categories.${result.category}`)}
            <span className="sr-only"> ({result.category_label})</span>
          </p>
          <p className="mt-1 text-mutedstar">{result.reason}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {result.checks.map((c) => {
              const status: VetStatus = c.status in STATUS_STYLE ? c.status : "not_checked";
              return (
                <li key={c.name}>
                  <span className="font-semibold text-starlight">{isKnownCheck(c.name) ? t(`checks.${c.name}`) : c.name}</span>
                  <span className={`ml-2 rounded border px-1 text-[10px] ${STATUS_STYLE[status]}`}>{t(`status.${status}`)}</span>
                  <span className="block text-mutedstar">{c.summary}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[10px] text-mutedstar/80">{t("disclaimer")}</p>
        </>
      )}
    </div>
  );
}
