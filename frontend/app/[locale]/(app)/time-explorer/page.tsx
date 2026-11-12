"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, TriangleAlert } from "lucide-react";
import JobProgress from "@/components/JobProgress";
import CutoutComparison from "@/components/CutoutComparison";
import Explainer from "@/components/Explainer";
import Glossary from "@/components/Glossary";
import LightCurve from "@/components/LightCurve";
import SearchBar from "@/components/SearchBar";
import SequencePlayer from "@/components/SequencePlayer";
import ShiftStackPanel from "@/components/ShiftStackPanel";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { useErrorText } from "@/lib/errors";
import { useTranslateLimitation } from "@/lib/limitations";
import {
  FOV_OPTIONS_ARCMIN,
  freeTextQuery,
  parseFrameParam,
  parseSequenceState,
  sequenceJobKey,
  sequenceStateUrl,
} from "@/lib/sequenceParams";
import { useResearch } from "@/lib/store";
import type { SequenceMode, SequenceRequest, SequenceResult } from "@/lib/types";
import { useJob } from "@/lib/useJob";

const AladinViewer = dynamic(() => import("@/components/AladinViewer"), {
  ssr: false,
  loading: () => <MapLoading />,
});

function MapLoading() {
  const t = useTranslations("timeExplorerPage");
  return <div className="flex h-full items-center justify-center text-xs text-mutedstar">{t("loadingMap")}</div>;
}

const MODES: SequenceMode[] = ["motion", "brightness"];

function Explorer() {
  const t = useTranslations("timeExplorerPage");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const translateLimitation = useTranslateLimitation();
  const friendlyError = (status: number | null, message: string): string =>
    status === 429 ? t("rateLimited") : message;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { target, setTarget } = useResearch();
  const embed = searchParams.get("embed") === "1";
  const query = useMemo(() => freeTextQuery(new URLSearchParams(searchParams.toString())), [searchParams]);
  const params = useMemo(
    () => (query ? null : parseSequenceState(new URLSearchParams(searchParams.toString()))),
    [query, searchParams]
  );
  const initialFrame = useMemo(() => parseFrameParam(searchParams.get("frame")), [searchParams]);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    if (!query) {
      setResolveError("");
      return;
    }
    let cancelled = false;
    setResolving(true);
    setResolveError("");
    api
      .resolveTarget({ query })
      .then((resolved) => {
        if (cancelled) return;
        setTarget(resolved);
        const current = new URLSearchParams(window.location.search);
        const probe = new URLSearchParams(current);
        probe.set("ra", String(resolved.propagated_ra_deg ?? resolved.ra_deg));
        probe.set("dec", String(resolved.propagated_dec_deg ?? resolved.dec_deg));
        const state = parseSequenceState(probe);
        if (!state) {
          setResolveError(t("invalidResolved"));
          return;
        }
        router.replace(
          sequenceStateUrl(
            { ...state, name: resolved.name.slice(0, 80) },
            { frame: parseFrameParam(current.get("frame")), embed: current.get("embed") === "1" }
          ),
          { scroll: false }
        );
      })
      .catch((e) => {
        if (!cancelled) setResolveError(errorText(e, t("resolveFailed")));
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const request = useMemo<SequenceRequest | null>(
    () =>
      params && {
        ra_deg: params.ra,
        dec_deg: params.dec,
        size_arcmin: params.fov,
        mode: params.mode,
        ...(params.detector ? { detector: params.detector } : {}),
        ...(params.reference ? { include_reference: true } : {}),
      },
    [params]
  );
  const key = request ? sequenceJobKey(request) : null;

  const job = useJob<SequenceResult>(key, (signal) => {
    if (!request) throw new Error("Missing coordinates.");
    return api.createSequence(request, { signal });
  });

  const update = useCallback(
    (changes: Record<string, string>) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("frame");
      for (const [k, v] of Object.entries(changes)) next.set(k, v);
      router.replace(`/time-explorer?${next.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const marker = useMemo(() => {
    if (!params) return null;
    const matches =
      target &&
      Math.abs((target.propagated_ra_deg ?? target.ra_deg) - params.ra) < 1e-4 &&
      Math.abs((target.propagated_dec_deg ?? target.dec_deg) - params.dec) < 1e-4;
    const name = (matches ? target?.name : params.name) || t("targetFallback");
    const propagated = matches && target?.propagated_ra_deg != null;
    return {
      name,
      ra: params.ra,
      dec: params.dec,
      label: propagated
        ? t("markerPropagated", { name, epoch: target?.propagated_epoch ?? t("markerEpochFallback") })
        : t("markerRequested", { name }),
    };
  }, [params, target, t]);

  if (!params || !request) {
    return (
      <div className="scroll-thin h-full overflow-y-auto p-3 md:p-4">
        <h1 className="text-lg font-bold text-starlight">{t("title")}</h1>
        {resolving && (
          <p role="status" className="mt-1 flex items-center gap-2 text-sm text-mutedstar">
            <Loader2 size={14} className="animate-spin text-pulse" /> {t("resolving", { query: query ?? "" })}
          </p>
        )}
        {resolveError && (
          <p role="alert" className="mt-1 max-w-xl text-sm text-red-300">
            {t("resolveError", { query: query ?? "", error: resolveError })}
          </p>
        )}
        <p className="mt-1 max-w-xl text-sm text-mutedstar">
          {!query && (searchParams.get("ra") || searchParams.get("dec"))
            ? `${t("invalidUrlCoords")} `
            : ""}
          {t("searchPrompt")}
        </p>
        <div className="mt-3">
          <SearchBar />
        </div>
      </div>
    );
  }

  const title = marker?.name ?? t("targetFallback");
  const result = job.phase === "completed" ? job.result : null;
  const busy = job.phase === "creating" || job.phase === "running";
  const shareUrl = (frame: number) => sequenceStateUrl(params, { frame });
  const exportName = `origin-${title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "target"}`;

  return (
    <div className={`scroll-thin h-full overflow-y-auto ${embed ? "p-2" : "p-3 md:p-4"}`}>
      {embed && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-mutedstar">
          <p>
            {t.rich("embedSummary", {
              b: (chunks) => <span className="font-semibold text-starlight">{chunks}</span>,
              title,
              fov: params.fov,
            })}
          </p>
          <a
            href={sequenceStateUrl(params)}
            target="_blank"
            rel="noopener"
            className="rounded border border-line px-2 py-1 text-pulse hover:border-pulse"
          >
            {t("openInApp")}
          </a>
        </div>
      )}
      {!embed && (
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-starlight">
            {t("title")} <span className="text-sm font-normal text-mutedstar">— {title}</span>
          </h1>
          <p className="text-[11px] text-mutedstar">
            {params.ra.toFixed(5)}°, {params.dec >= 0 ? "+" : ""}
            {params.dec.toFixed(5)}° · {t("fieldSorted", { fov: params.fov })}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-[11px] text-mutedstar">
          <label className="flex flex-col gap-0.5">
            {t("fov")}
            <select
              value={FOV_OPTIONS_ARCMIN.includes(params.fov) ? params.fov : ""}
              onChange={(e) => update({ fov: e.target.value })}
              className="rounded border border-line bg-deep px-2 py-1.5 text-xs text-starlight"
            >
              {!FOV_OPTIONS_ARCMIN.includes(params.fov) && <option value="">{params.fov}′</option>}
              {FOV_OPTIONS_ARCMIN.map((f) => (
                <option key={f} value={f}>
                  {f}′
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="mb-0.5">{t("mode")}</legend>
            <div className="flex rounded border border-line bg-deep p-0.5">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={params.mode === m}
                  title={t(`modes.${m}.help`)}
                  onClick={() => update({ mode: m })}
                  className={`rounded px-2.5 py-1 text-xs ${
                    params.mode === m ? "bg-panel text-pulse" : "text-mutedstar hover:text-starlight"
                  }`}
                >
                  {t(`modes.${m}.label`)}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-1.5 pb-1.5" title={t("referenceHelp")}>
            <input
              type="checkbox"
              checked={params.reference}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams.toString());
                next.delete("frame");
                if (e.target.checked) next.set("ref", "1");
                else next.delete("ref");
                router.replace(`/time-explorer?${next.toString()}`, { scroll: false });
              }}
            />
            {t("includeReference")}
          </label>
        </div>
      </div>
      )}

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
            <p className="mt-1 text-mutedstar">{friendlyError(job.errorStatus, job.error)}</p>
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
          <section className="mb-3 max-w-xl rounded border border-line bg-deep p-3 text-xs text-mutedstar">
            <p className="font-semibold text-starlight">{t("noCoverageTitle")}</p>
            <p className="mt-1">
              {t("noCoverage", { discarded: Math.max(0, result.n_available) })}
            </p>
            {result.limitations.length > 0 && (
              <ul className="mt-1">
                {result.limitations.map((l, i) => (
                  <li key={i}>· {translateLimitation(l)}</li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <section aria-label={t("sequenceLabel")} className="min-w-0">
        {result && result.frames.length > 0 && (
          <SequencePlayer
            key={job.job?.job_id ?? key}
            result={result}
            fovArcmin={params.fov}
            onFovChange={(fov) => update({ fov: String(fov) })}
            initialFrame={initialFrame}
            shareUrl={shareUrl}
            exportName={exportName}
          />
        )}
      </section>

      {embed && (
        <p className="mt-2 text-center text-[10px] text-mutedstar">
          {t("embedCredit")}
        </p>
      )}

      {!embed && (
        <div className="mt-4 flex flex-col gap-2" data-testid="advanced-panels">
          <Explainer />
          <details
            className="rounded border border-line bg-deep/60"
            onToggle={(e) => setMapOpen(e.currentTarget.open)}
          >
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-mutedstar">{t("skyMap")}</summary>
            <section aria-label={t("skyMap")} className="h-[360px] overflow-hidden border-t border-line">
              {mapOpen && <AladinViewer ra={params.ra} dec={params.dec} fovArcmin={params.fov} marker={marker} />}
            </section>
          </details>
          {result && result.frames.length > 0 && (
            <>
              {result.lightcurve && (
                <details className="rounded border border-line bg-deep/60" open={params.mode === "brightness"}>
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-mutedstar">
                    {t("lightCurve")}
                  </summary>
                  <div className="p-3">
                    <LightCurve curve={result.lightcurve} />
                  </div>
                </details>
              )}
              <details className="rounded border border-line bg-deep/60">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-mutedstar">
                  {t("shiftStack")}
                </summary>
                <div className="p-3">
                  <ShiftStackPanel ra={params.ra} dec={params.dec} detector={params.detector} />
                </div>
              </details>
            </>
          )}
          <Glossary />
          <details className="rounded border border-line bg-deep/60">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-mutedstar">
              {t("manualCompare")}
            </summary>
            <div className="p-3">
              <CutoutComparison />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

export default function TimeExplorerPage() {
  const t = useTranslations("timeExplorerPage");
  return (
    <Suspense
      fallback={<div className="p-4 text-xs text-mutedstar">{t("loadingExplorer")}</div>}
    >
      <Explorer />
    </Suspense>
  );
}
