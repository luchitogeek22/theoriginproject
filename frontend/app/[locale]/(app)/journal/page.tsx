"use client";

/** RESEARCH JOURNAL — save reproducible investigations, export evidence. */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2, Save } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { api, apiUrl } from "@/lib/api";
import { useErrorText } from "@/lib/errors";
import { useResearch } from "@/lib/store";

const LS_SAVED = "origin-saved-research";

// Methods and limitations below are part of the stored evidence record (English, invariant).
const ANALYSIS_METHODS = [
  "SIA2 cone search via SPHERExDataGateway (collections pinned per query)",
  "Spatial cutout at target position (6 arcmin default)",
  "WCS reprojection + background match + variance-propagated difference",
  "photutils segmentation detection; centroid astrometry per epoch",
];

export default function Journal() {
  const t = useTranslations("journalPage");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const router = useRouter();
  const { target, search, selected, cutouts, candidates } = useResearch();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Array<{ id: string; title: string }>>([]);
  const [lastSaved, setLastSaved] = useState("");
  const currentJob = candidates.length > 0 ? candidates[0].job_id : "";
  const currentCandidates = candidates.filter((c) => c.job_id === currentJob);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_SAVED);
      if (raw) setSaved(JSON.parse(raw) as Array<{ id: string; title: string }>);
    } catch { /* noop */ }
  }, []);

  const persist = (list: Array<{ id: string; title: string }>) => {
    setSaved(list);
    try {
      localStorage.setItem(LS_SAVED, JSON.stringify(list));
    } catch { /* noop */ }
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        target: target
          ? { name: target.name, ra_deg: target.ra_deg, dec_deg: target.dec_deg, resolver: target.resolver, catalog_id: target.catalog_id }
          : null,
        observations: selected.map((o) => ({
          obs_id: o.obs_id,
          collection: o.collection,
          date_obs: o.date_obs,
          t_min_mjd: o.t_min_mjd,
          detector: o.detector,
          band: o.band,
          access_url: o.access_url,
        })),
        search_meta: search ? { queried_at: search.queried_at, cached: search.cached, collections: search.collections_queried } : null,
        cutouts: cutouts.map((c) => ({ cutout_id: c.cutout_id, sha256: c.sha256, source_url: c.source_url })),
        candidates: currentCandidates.map((c) => ({
          id: c.id,
          job_id: c.job_id,
          kind: c.kind,
          ra_deg: c.ra_deg,
          dec_deg: c.dec_deg,
          snr: c.snr,
          separation_arcsec: c.separation_arcsec,
          delta_mag: c.delta_mag,
          quality: c.quality,
        })),
        methods: currentJob ? ANALYSIS_METHODS : [],
        measurements: [],
        limitations: [
          "Visualization-grade spectral profiles use WCS-WAVE, not CWAVE/CBAND",
          "Apparent shifts are on the celestial sphere, not 3D motions",
          "Candidates are unvalidated until independent confirmation",
        ],
        reproducibility: {
          api: "POST /api/v1/observations/search with ra_deg/dec_deg/radius_arcmin",
          note: "Re-run the same query; IRSA holdings evolve (~weekly QR updates).",
        },
      };
      const res = await api.saveResearch({
        title: title || t("defaultTitle", { name: target?.name ?? t("untargeted") }),
        target_name: target?.name ?? "",
        ra_deg: target?.ra_deg ?? null,
        dec_deg: target?.dec_deg ?? null,
        payload,
      });
      const id = String(res.id);
      setLastSaved(id);
      persist([{ id, title: title || target?.name || id }, ...saved].slice(0, 30));
      router.push(`/journal/${id}`);
    } catch (e) {
      setError(errorText(e, t("saveFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto p-3 md:p-4">
      <h1 className="mb-2 text-lg font-bold text-starlight">{t("title")}</h1>
      <div className="grid gap-2 lg:grid-cols-[1fr_320px]">
        <div className="rounded border border-line bg-deep p-3">
          <h2 className="mb-1 text-sm font-semibold text-starlight">{t("currentTitle")}</h2>
          {!target && <p className="text-xs text-mutedstar">{t("noTarget")}</p>}
          {target && (
            <div className="text-xs text-mutedstar">
              <p><b className="text-starlight">{target.name}</b> — {target.ra_deg.toFixed(5)}°, {target.dec_deg.toFixed(5)}° ({target.resolver})</p>
              <p className="mt-1">
                {t("counts", { selected: selected.length, cutouts: cutouts.length, candidates: currentCandidates.length })}
              </p>
              <ul className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
                {selected.map((o, i) => (
                  <li key={i} className="truncate">· {o.obs_id} [{o.collection}] {o.date_obs}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-2 flex gap-1.5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              className="flex-1 rounded border border-line bg-abyss px-2 py-1.5 text-xs outline-none focus:border-pulse"
            />
            <button
              onClick={() => void save()}
              disabled={busy || (!target && selected.length === 0)}
              className="flex items-center gap-1.5 rounded bg-pulse px-3 py-1.5 text-xs font-bold text-abyss hover:brightness-110 disabled:opacity-40"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {tc("save")}
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
          {lastSaved && (
            <p className="mt-1 text-xs text-mutedstar">
              {t("savedLink")}{" "}
              <Link href={`/journal/${lastSaved}`} className="text-pulse hover:underline">/journal/{lastSaved}</Link>
            </p>
          )}
        </div>

        <div className="rounded border border-line bg-deep p-3">
          <h2 className="mb-1 text-sm font-semibold text-starlight">{t("savedTitle")}</h2>
          {saved.length === 0 && <p className="text-xs text-mutedstar">{t("nothingSaved")}</p>}
          <ul className="flex flex-col gap-1">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-1 text-xs">
                <Link href={`/journal/${s.id}`} className="truncate text-pulse hover:underline">{s.title}</Link>
                <span className="flex gap-1">
                  <a href={apiUrl(`/api/v1/evidence/${s.id}/report?format=pdf`)} title={t("downloadPdf")} className="text-mutedstar hover:text-starlight"><Download size={13} /></a>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
