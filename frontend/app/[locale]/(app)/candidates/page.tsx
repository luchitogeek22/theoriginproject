"use client";

/** Candidate tracking. Everything is a possible candidate until validated;
 * every row links to its job and observations. */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Crosshair, Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { useErrorText } from "@/lib/errors";
import VettingPanel from "@/components/VettingPanel";
import { useResearch } from "@/lib/store";
import type { Candidate } from "@/lib/types";
import ResultBadge from "@/components/ResultBadge";

const KINDS = [
  "all",
  "possible moving source",
  "variable source",
  "possible transient",
  "persistent source",
  "instrumental artifact",
  "unclassified",
];

type EvidenceObs = { obs_a?: unknown; obs_b?: unknown };

/** API kind (English, stable) → catalogue key of its label. */
const KIND_KEYS = {
  "possible moving source": "movingSource",
  "variable source": "variableSource",
  "possible transient": "transient",
  "persistent source": "persistentSource",
  "instrumental artifact": "artifact",
  unclassified: "unclassified",
} as const;

export default function Candidates() {
  const t = useTranslations("candidatesPage");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const kindLabel = (kind: string): string =>
    kind in KIND_KEYS ? t(`kinds.${KIND_KEYS[kind as keyof typeof KIND_KEYS]}`) : kind;
  const router = useRouter();
  const { candidates, setCandidates, requestFocus } = useResearch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState<Candidate | null>(null);
  const [vettingId, setVettingId] = useState<number | null>(null);

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
      .catch((e) => setError(errorText(e, t("loadFailed"))))
      .finally(() => setLoading(false));
  }, [setCandidates]);

  const rows = filter === "all" ? candidates : candidates.filter((c) => c.kind === filter);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-3 md:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-starlight">
          {t("title")} <ResultBadge kind="candidate" />{" "}
          <span className="text-xs font-normal text-mutedstar">
            {t("subtitle")}
          </span>
        </h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded border border-line bg-deep px-2 py-1.5 text-xs"
          aria-label={t("filterLabel")}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>{k === "all" ? t("allCategories") : kindLabel(k)}</option>
          ))}
        </select>
      </div>
      {loading && <p className="flex items-center gap-1 text-xs text-mutedstar"><Loader2 size={13} className="animate-spin" /> {tc("loading")}</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}

      {!loading && rows.length === 0 && (
        <div className="mt-6 max-w-lg text-sm text-mutedstar">
          <p className="font-semibold text-starlight">{t("emptyTitle")}</p>
          <p className="mt-1">
            {t("emptyBody")}
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
                <span className="font-semibold text-starlight">{t("candidate", { id: c.id })}</span>
                <span className="ml-2 rounded border border-line px-1 text-gold">{kindLabel(c.kind)}</span>
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
            <p className="font-semibold text-starlight">{t("detailTitle", { id: active.id, kind: kindLabel(active.kind) })}</p>
            <p className="mt-1 text-mutedstar">
              {t("position", { coords: `${active.ra_deg.toFixed(6)}°, ${active.dec_deg.toFixed(6)}°` })}
            </p>
            <p className="text-mutedstar">{t("job", { id: active.job_id })}</p>
            <p className="text-mutedstar">
              {t("obsAB", {
                a: String((active.evidence as EvidenceObs | null)?.obs_a ?? "—"),
                b: String((active.evidence as EvidenceObs | null)?.obs_b ?? "—"),
              })}
            </p>
            {active.separation_arcsec !== null && active.separation_arcsec !== undefined && (
              <p className="text-mutedstar">
                {t("shift", {
                  value: active.separation_arcsec.toFixed(3),
                  error: active.separation_err_arcsec?.toFixed(3) ?? "?",
                })}
              </p>
            )}
            {active.snr !== null && active.snr !== undefined && (
              <p className="text-mutedstar">SNR: {active.snr.toFixed(2)}</p>
            )}
            <p className="text-mutedstar">{t("quality", { value: active.quality })}</p>
            <details className="mt-1">
              <summary className="cursor-pointer text-pulse">{t("evidence")}</summary>
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
              <Crosshair size={13} /> {t("viewOnSphere")}
            </button>
            <button
              type="button"
              aria-expanded={vettingId === active.id}
              onClick={() => setVettingId(vettingId === active.id ? null : active.id)}
              className="mt-2 flex items-center gap-1 rounded border border-line px-2 py-1.5 text-starlight hover:border-pulse"
            >
              {vettingId === active.id ? t("hideVerification") : t("verify")}
            </button>
            {vettingId === active.id && <VettingPanel key={active.id} candidateId={active.id} />}
          </div>
        )}
      </div>
    </div>
  );
}
