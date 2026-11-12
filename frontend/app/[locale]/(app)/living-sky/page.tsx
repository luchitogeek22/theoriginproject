"use client";

/** LIVING SKY — celestial exploration wired to live archive queries. */

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronRight, Loader2, PanelRightClose, PanelRightOpen, Search } from "lucide-react";
import SkyView from "@/components/SkyView";
import SearchBar from "@/components/SearchBar";
import CopilotPanel from "@/components/CopilotPanel";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { mjdToDate } from "@/lib/coords";
import { useErrorText } from "@/lib/errors";
import { useResearch } from "@/lib/store";
import type { Observation } from "@/lib/types";

export default function LivingSky() {
  const t = useTranslations("livingSkyPage");
  const format = useFormatter();
  const errorText = useErrorText();
  const router = useRouter();
  const { mode, target, search, setSearch, selected, toggleSelected, requestFocus } = useResearch();
  const [radius, setRadius] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Observation | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState<"results" | "copilot">("results");

  const requery = async () => {
    if (!target || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.searchObservations({
        ra_deg: target.ra_deg,
        dec_deg: target.dec_deg,
        radius_arcmin: radius,
      });
      setSearch(res);
    } catch (e) {
      setError(errorText(e, t("archiveQueryFailed")));
    } finally {
      setBusy(false);
    }
  };

  const observations = search?.items ?? [];

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1">
        <SkyView observations={observations} onSelectObservation={setDetail} />
      </div>

      {panelOpen ? (
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-deep/70">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <div className="flex gap-1 text-[11px]">
              <button
                onClick={() => setTab("results")}
                className={`rounded px-2 py-1 ${tab === "results" ? "bg-panel text-pulse" : "text-mutedstar"}`}
              >
                {t("tabResults")}
              </button>
              <button
                onClick={() => setTab("copilot")}
                className={`rounded px-2 py-1 ${tab === "copilot" ? "bg-panel text-pulse" : "text-mutedstar"}`}
              >
                {t("tabCopilot")}
              </button>
            </div>
            <button onClick={() => setPanelOpen(false)} aria-label={t("hidePanel")} className="text-mutedstar hover:text-starlight">
              <PanelRightClose size={15} />
            </button>
          </div>

          {tab === "copilot" ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3"><CopilotPanel /></div>
          ) : (
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
              <SearchBar compact />
              {target && (
                <div className="mt-2 rounded border border-line bg-panel/60 p-2 text-[11px]">
                  <p className="font-semibold text-starlight">{target.name}</p>
                  <p className="text-mutedstar">
                    {target.ra_deg.toFixed(5)}°, {target.dec_deg.toFixed(5)}° · {target.frame}/{target.epoch}
                  </p>
                  <p className="text-mutedstar/70">{t("resolvedBy", { resolver: target.resolver || "—" })}{target.catalog_id ? ` · ${target.catalog_id}` : ""}</p>
                  {target.warning && <p className="text-gold">{target.warning}</p>}
                  <button
                    onClick={() => requestFocus(target.ra_deg, target.dec_deg)}
                    className="mt-1 text-pulse hover:underline"
                  >
                    {t("centerSphere")}
                  </button>
                </div>
              )}

              <div className="mt-2 flex items-center gap-2 text-[11px] text-mutedstar">
                <label className="flex items-center gap-1">
                  {t("radius")}
                  <input type="range" min={2} max={60} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-20" aria-label={t("radiusAria")} />
                  {radius}′
                </label>
                <button
                  onClick={() => void requery()}
                  disabled={!target || busy}
                  className="flex items-center gap-1 rounded border border-line px-2 py-1 hover:border-pulse disabled:opacity-40"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                  {t("query")}
                </button>
              </div>
              {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}

              {search && (
                <p className="mt-2 text-[11px] text-mutedstar">
                  {search.count === 0
                    ? t("noObservations")
                    : t("summary", {
                        count: search.count,
                        date: format.dateTime(new Date(search.queried_at), { dateStyle: "medium", timeStyle: "medium" }),
                        cached: search.cached ? "yes" : "no",
                      })}
                </p>
              )}
              {search?.warnings.map((w, i) => (
                <p key={i} className="mt-1 text-[11px] text-gold">{w}</p>
              ))}

              <ul className="mt-2 flex flex-col gap-1.5">
                {observations.map((o, i) => {
                  const isSel = selected.some((s) => s.id === o.id && s.obs_id === o.obs_id);
                  return (
                    <li key={`${o.obs_id}-${i}`}>
                      <button
                        onClick={() => toggleSelected(o)}
                        className={`w-full rounded border p-2 text-left text-[11px] transition-colors ${
                          isSel ? "border-pulse bg-panel" : "border-line bg-deep hover:border-pulse/50"
                        }`}
                      >
                        <p className="truncate font-medium text-starlight">{o.obs_id || t("noObsId")}</p>
                        <p className="text-mutedstar">
                          {o.collection} · {o.date_obs || mjdToDate(o.t_min_mjd)}
                          {mode === "investigate" && ` · det ${o.detector || "—"} · ${o.band || "—"}`}
                        </p>
                        {mode === "investigate" && (
                          <p className="truncate text-mutedstar/70">{o.access_url}</p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {detail && (
                <div className="mt-2 rounded border border-gold/50 bg-panel/60 p-2 text-[11px]">
                  <p className="font-semibold text-starlight">{t("detailTitle")}</p>
                  <p className="text-mutedstar">{detail.obs_id}</p>
                  <p className="text-mutedstar">{detail.collection} · {detail.date_obs || mjdToDate(detail.t_min_mjd)}</p>
                  <p className="text-mutedstar">
                    {t("detailMeta", {
                      detector: detail.detector || "—",
                      band: detail.band || "—",
                      type: detail.dataproduct_type || "—",
                    })}
                  </p>
                  {detail.ra_deg !== null && (
                    <button
                      onClick={() => requestFocus(detail.ra_deg as number, detail.dec_deg as number)}
                      className="mt-1 text-pulse hover:underline"
                    >
                      {t("centerFootprint")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-line p-2">
            <button
              onClick={() => router.push("/time-explorer")}
              disabled={selected.length === 0}
              className="flex w-full items-center justify-center gap-1 rounded bg-pulse px-3 py-2 text-xs font-bold text-abyss hover:brightness-110 disabled:opacity-40"
            >
              {t("startInvestigation", { count: selected.length })} <ChevronRight size={14} />
            </button>
            {selected.length === 1 && (
              <p className="mt-1 text-center text-[10px] text-mutedstar">{t("compareHint")}</p>
            )}
          </div>
        </aside>
      ) : (
        <button
          onClick={() => setPanelOpen(true)}
          aria-label={t("showPanel")}
          className="border-l border-line bg-deep/70 px-1.5 text-mutedstar hover:text-starlight"
        >
          <PanelRightOpen size={15} />
        </button>
      )}
    </div>
  );
}
