"use client";

/** Rule-based interpretation assistant.
 * Answers ONLY from the current job's measurements and loaded metadata.
 * The "measured" label is reserved for values computed by the scientific engine. */

import { useState } from "react";
import { MessageCircleQuestion, Send } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useResearch } from "@/lib/store";

interface Answer {
  kind: "measured" | "archive" | "inferred" | "explanatory";
  text: string;
}

const SUGGESTED = ["motion", "difference", "count", "brightness"] as const;

/** Lower-case and strip diacritics so keywords match with or without accents. */
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Question keywords per topic, in the supported UI languages (English and Spanish). */
const KEYWORDS = {
  count: ["cuant", "observaciones se han", "how many", "observations have been"],
  motion: ["muev", "moverse", "desplaz", "move", "moving", "motion", "shift", "displac"],
  difference: ["diferencial", "difference"],
  brightness: ["brillo", "variaci", "brightness", "variation"],
  seeing: ["quep", "que estoy", "viendo", "what am i", "seeing", "looking at"],
} as const;

const matches = (q: string, topic: keyof typeof KEYWORDS) => KEYWORDS[topic].some((k) => q.includes(k));

export default function CopilotPanel() {
  const t = useTranslations("copilotPanel");
  const format = useFormatter();
  const { target, search, selected, candidates, currentJobId } = useResearch();
  const jobCandidates = currentJobId ? candidates.filter((c) => c.job_id === currentJobId) : [];
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Array<{ q: string; a: Answer[] }>>([]);

  const answer = (question: string): Answer[] => {
    const q = normalize(question);
    if (matches(q, "count")) {
      if (!search) {
        return [{ kind: "archive", text: t("answers.noSearch") }];
      }
      return [
        {
          kind: "archive",
          text: t("answers.found", {
            count: search.count,
            date: format.dateTime(new Date(search.queried_at), { dateStyle: "short", timeStyle: "medium" }),
            cached: search.cached ? "true" : "false",
          }),
        },
        { kind: "explanatory", text: t("answers.observationExplain") },
      ];
    }
    if (matches(q, "motion")) {
      const astro = jobCandidates.find((c) => c.kind.includes("moving"));
      const parts: Answer[] = [{ kind: "explanatory", text: t("answers.motionExplain") }];
      if (astro?.separation_arcsec !== null && astro?.separation_arcsec !== undefined) {
        parts.unshift({
          kind: "measured",
          text: t("answers.motionMeasured", {
            separation: astro.separation_arcsec.toFixed(2),
            error: astro.separation_err_arcsec?.toFixed(2) ?? "?",
            id: String(astro.id),
            snr: astro.snr?.toFixed(1) ?? "—",
          }),
        });
        parts.push({ kind: "inferred", text: t("answers.motionInferred") });
      } else {
        parts.unshift({ kind: "archive", text: t("answers.motionNone") });
      }
      return parts;
    }
    if (matches(q, "difference")) {
      return [
        { kind: "explanatory", text: t("answers.differenceExplain") },
        { kind: "inferred", text: t("answers.differenceInferred") },
      ];
    }
    if (matches(q, "brightness")) {
      return [
        { kind: "explanatory", text: t("answers.brightnessExplain") },
        {
          kind: "archive",
          text: target ? t("answers.brightnessTarget", { name: target.name }) : t("answers.brightnessNoTarget"),
        },
      ];
    }
    if (matches(q, "seeing")) {
      if (!target) return [{ kind: "archive", text: t("answers.seeingNoTarget") }];
      return [
        {
          kind: "archive",
          text: t("answers.seeingTarget", {
            name: target.name,
            ra: target.ra_deg.toFixed(5),
            dec: target.dec_deg.toFixed(5),
            resolver: target.resolver || t("answers.defaultResolver"),
          }),
        },
        { kind: "explanatory", text: t("answers.seeingExplain") },
      ];
    }
    return [{ kind: "explanatory", text: t("answers.fallback") }];
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
        <MessageCircleQuestion size={16} className="text-pulse" /> {t("title")}
      </div>
      <p className="mb-3 text-[11px] text-mutedstar">{t("intro")}</p>
      <div className="mb-3 flex flex-1 flex-col gap-3 overflow-y-auto pr-1" style={{ maxHeight: 320 }}>
        {history.length === 0 && (
          <p className="text-xs text-mutedstar">
            {selected.length > 0 ? t("emptySelected", { count: selected.length }) : t("emptyNone")}
          </p>
        )}
        {history.map((h, i) => (
          <div key={i} className="flex flex-col gap-1">
            <p className="text-xs font-medium text-starlight">{h.q}</p>
            {h.a.map((part, j) => (
              <p key={j} className="text-xs text-mutedstar">
                <span className="mr-1 rounded border border-line px-1 text-[10px] text-pulse">{t(`badges.${part.kind}`)}</span>
                {part.text}
              </p>
            ))}
          </div>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {SUGGESTED.map((key) => (
          <button key={key} onClick={() => ask(t(`suggested.${key}`))} className="rounded border border-line px-2 py-1 text-[11px] text-mutedstar hover:text-starlight">
            {t(`suggested.${key}`)}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(input)}
          placeholder={t("placeholder")}
          aria-label={t("inputLabel")}
          className="w-full rounded border border-line bg-deep px-2 py-1.5 text-xs text-starlight outline-none placeholder:text-mutedstar/60 focus:border-pulse"
        />
        <button onClick={() => ask(input)} aria-label={t("send")} className="rounded border border-line px-2 text-pulse hover:bg-panel">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
