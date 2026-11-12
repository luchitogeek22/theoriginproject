"use client";

/** Entry screen: search, challenge targets, three actions and real archive status. */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Clock3, Crosshair, Orbit, Play, RefreshCw } from "lucide-react";
import SearchBar from "@/components/SearchBar";
import SkyBackdrop from "@/components/SkyBackdrop";
import { DataRelease, StatusDot, useDataSources } from "@/components/StatusBanner";
import { api } from "@/lib/api";
import { sequenceUrl, targetSequenceRequest } from "@/lib/sequenceParams";
import { useResearch } from "@/lib/store";
import { Link, useRouter } from "@/i18n/navigation";
import { VALIDATION_TARGETS, useTargetCopy, type ValidationTarget } from "@/lib/targets";

export default function Home() {
  const t = useTranslations("observatoryPage");
  const tc = useTranslations("common");
  const targetCopy = useTargetCopy();
  const router = useRouter();
  const { target } = useResearch();
  const { sources, note, collections, error, loading, refresh } = useDataSources();
  const prefetched = useRef(new Set<string>());
  const [leaving, setLeaving] = useState(false);

  const prefetch = (vt: ValidationTarget) => {
    if (prefetched.current.has(vt.key)) return;
    prefetched.current.add(vt.key);
    api.createSequence(targetSequenceRequest(vt, vt.mode)).catch(() => {});
  };

  return (
    <div className="scroll-thin relative h-full w-full overflow-y-auto">
      <div
        className="absolute inset-0 bg-abyss"
        style={{ backgroundImage: "radial-gradient(ellipse at 70% 20%, rgba(90,143,224,0.12), transparent 60%)" }}
        aria-hidden="true"
      />
      <SkyBackdrop targets={VALIDATION_TARGETS} onPrefetch={prefetch} onLeaving={setLeaving} />
      <div
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(5,7,13,0.9) 0%, rgba(5,7,13,0.62) 34%, rgba(5,7,13,0) 68%), linear-gradient(0deg, rgba(5,7,13,0.85) 0%, rgba(5,7,13,0) 38%)",
        }}
        aria-hidden="true"
      />

      <div
        className={`pointer-events-none relative z-10 flex min-h-full flex-col justify-between gap-6 p-4 transition-opacity duration-700 md:p-6 ${leaving ? "opacity-0" : "opacity-100"}`}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="pointer-events-auto max-w-xl"
        >
          <p className="text-[11px] tracking-[0.25em] text-pulse">{tc("brand")} · SPHEREx</p>
          <h1 className="mt-1 text-3xl font-bold text-starlight md:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-1 max-w-md text-xs text-mutedstar md:text-sm">
            {t("intro")}
          </p>
          <div className="mt-3">
            <SearchBar />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/demo"
              data-testid="home-demo-link"
              className="flex items-center gap-1.5 rounded bg-pulse px-3 py-2 text-xs font-bold text-abyss hover:brightness-110"
            >
              <Play size={14} /> {t("demo")}
            </Link>
            <button
              onClick={() => router.push("/living-sky")}
              className="flex items-center gap-1.5 rounded border border-pulse/60 bg-abyss/80 px-3 py-2 text-xs font-semibold text-pulse hover:border-pulse"
            >
              <Orbit size={14} /> {t("exploreSky")}
            </button>
            <button
              onClick={() => router.push("/living-sky")}
              className="flex items-center gap-1.5 rounded border border-line bg-abyss/80 px-3 py-2 text-xs font-semibold text-starlight hover:border-pulse"
            >
              <Crosshair size={14} /> {t("findObject")}
            </button>
            <button
              onClick={() => router.push(target ? sequenceUrl(target) : "/time-explorer")}
              className="flex items-center gap-1.5 rounded border border-gold/60 bg-abyss/80 px-3 py-2 text-xs font-semibold text-gold hover:border-gold"
            >
              <Clock3 size={14} /> {t("seeChange")}
            </button>
          </div>
        </motion.div>

        <section className="pointer-events-auto" aria-label={t("targetsLabel")}>
          <h2 className="text-sm font-semibold text-starlight">{t("targetsTitle")}</h2>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {VALIDATION_TARGETS.map((vt) => (
              <li key={vt.key}>
                <Link
                  href={sequenceUrl(vt, undefined, vt.mode)}
                  onMouseEnter={() => prefetch(vt)}
                  onFocus={() => prefetch(vt)}
                  className="flex h-full min-h-[120px] flex-col justify-between gap-3 rounded-xl p-4 transition-colors hover:bg-pulse/5 focus-visible:bg-pulse/5 focus-visible:outline-none"
                >
                  <span className="text-base font-semibold leading-snug text-starlight">{targetCopy(vt.key).hook}</span>
                  <span className="flex items-center justify-between text-[11px] text-mutedstar">
                    {vt.name}
                    <span className="text-pulse">
                      {vt.mode === "motion" ? t("modeMotion") : t("modeBrightness")} →
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="pointer-events-auto flex flex-wrap items-end justify-between gap-2">
          <div className="max-w-md rounded-xl bg-white/[0.04] p-2.5 text-[11px] ring-1 ring-inset ring-white/[0.06] backdrop-blur-md">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="font-semibold text-starlight">SPHEREx · IRSA</span>
              <button
                onClick={() => void refresh()}
                className="flex items-center gap-1 text-mutedstar hover:text-starlight"
                title={t("recheckTitle")}
              >
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> {t("recheck")}
              </button>
            </div>
            {loading && <p className="text-mutedstar">{t("querying")}</p>}
            {error && <p className="text-red-300">{error}</p>}
            {sources?.map((s) => (
              <p key={s.name} className="flex items-center gap-1.5 text-mutedstar">
                <StatusDot ok={s.reachable} pending={loading} />
                {s.reachable
                  ? t("sourceAvailable", { name: s.name, latency: s.latency_ms ?? "—" })
                  : t("sourceUnavailable", { name: s.name, detail: s.detail })}
              </p>
            ))}
            <DataRelease collections={collections} />
            {note && <p className="mt-1 text-mutedstar/70">{note}</p>}
          </div>
          {target && (
            <Link
              href="/journal"
              className="rounded-xl bg-white/[0.04] px-3 py-2 text-[11px] text-mutedstar ring-1 ring-inset ring-white/[0.06] backdrop-blur-md transition-colors hover:bg-white/[0.07] hover:text-starlight"
            >
              {t.rich("ongoing", {
                name: (chunks) => <span className="text-starlight">{chunks}</span>,
                target: target.name,
              })}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
