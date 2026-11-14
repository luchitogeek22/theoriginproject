"use client";

/** Entry screen: search, challenge targets, three actions and real archive status. */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Clock3, Crosshair, Orbit, Play, X } from "lucide-react";
import SearchBar from "@/components/SearchBar";
import SkyBackdrop from "@/components/SkyBackdrop";
import TargetCurve from "@/components/TargetCurve";
import { api } from "@/lib/api";
import { sequenceUrl, targetSequenceRequest } from "@/lib/sequenceParams";
import { useResearch } from "@/lib/store";
import { Link, useRouter } from "@/i18n/navigation";
import { SHOW_EXTRA_PAGES } from "@/lib/features";
import { VALIDATION_TARGETS, useTargetCopy, type ValidationTarget } from "@/lib/targets";

export default function Home() {
  const t = useTranslations("observatoryPage");
  const tc = useTranslations("common");
  const targetCopy = useTargetCopy();
  const router = useRouter();
  const { target, reset } = useResearch();
  const prefetched = useRef(new Set<string>());
  const [leaving, setLeaving] = useState(false);

  const prefetch = (vt: ValidationTarget) => {
    if (prefetched.current.has(vt.key)) return;
    prefetched.current.add(vt.key);
    api.createSequence(targetSequenceRequest(vt, vt.mode)).catch(() => {});
  };

  return (
    <div className="scroll-thin relative -mt-11 h-[calc(100%+2.75rem)] w-full overflow-y-auto">
      <div
        className="absolute inset-0 bg-abyss"
        style={{ backgroundImage: "radial-gradient(ellipse at 70% 20%, rgba(36,86,184,0.14), transparent 60%)" }}
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
        className={`pointer-events-none relative z-10 flex min-h-full flex-col justify-between gap-6 p-4 pt-[3.75rem] transition-opacity duration-700 md:p-6 md:pt-[4.25rem] ${leaving ? "opacity-0" : "opacity-100"}`}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="pointer-events-auto"
        >
          <p className="text-[11px] tracking-[0.25em] text-pulse">{tc("brand")} · SPHEREx</p>
          <h1 className="mt-1 max-w-xl text-3xl font-bold text-starlight md:text-4xl">
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
              className="flex items-center gap-1.5 rounded-full bg-pulse px-3.5 py-2 text-xs font-bold text-starlight hover:brightness-110"
            >
              <Play size={14} /> {t("demo")}
            </Link>
            {/* The search bar above already finds an object; these lead to the living sky. */}
            {SHOW_EXTRA_PAGES && (
              <>
                <button
                  onClick={() => router.push("/living-sky")}
                  className="flex items-center gap-1.5 rounded-full border border-pulse/60 bg-abyss/80 px-3.5 py-2 text-xs font-semibold text-starlight hover:border-pulse"
                >
                  <Orbit size={14} /> {t("exploreSky")}
                </button>
                <button
                  onClick={() => router.push("/living-sky")}
                  className="flex items-center gap-1.5 rounded-full border border-line bg-abyss/80 px-3.5 py-2 text-xs font-semibold text-starlight hover:border-pulse"
                >
                  <Crosshair size={14} /> {t("findObject")}
                </button>
              </>
            )}
            <button
              onClick={() => router.push(target ? sequenceUrl(target) : "/time-explorer")}
              className="flex items-center gap-1.5 rounded-full border border-line bg-abyss/80 px-3.5 py-2 text-xs font-semibold text-starlight hover:border-pulse"
            >
              <Clock3 size={14} /> {t("seeChange")}
            </button>
          </div>
        </motion.div>

        <section className="pointer-events-auto" aria-label={t("targetsLabel")}>
          <h2 className="text-base font-semibold text-starlight">{t("targetsTitle")}</h2>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {VALIDATION_TARGETS.map((vt, i) => (
              <li key={vt.key}>
                <Link
                  href={sequenceUrl(vt, undefined, vt.mode)}
                  onMouseEnter={() => prefetch(vt)}
                  onFocus={() => prefetch(vt)}
                  className="flex h-full min-h-[150px] flex-col justify-between gap-3 rounded-xl border border-line/70 bg-deep/60 p-4 transition-colors hover:border-pulse/50 hover:bg-deep/80 focus-visible:border-pulse/50 focus-visible:outline-none"
                >
                  <span className="flex items-center justify-between text-[11px]">
                    <span className="font-mono font-semibold text-pulse">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-mutedstar">{vt.mode === "motion" ? t("modeMotion") : t("modeBrightness")}</span>
                  </span>
                  <span className="text-base font-semibold leading-snug text-starlight">{targetCopy(vt.key).hook}</span>
                  <TargetCurve targetKey={vt.key} />
                  <span className="flex items-center justify-between text-[11px] text-mutedstar">
                    {vt.name}
                    <span className="font-semibold text-pulse">
                      {vt.mode === "motion" ? t("modeMotion") : t("modeBrightness")} →
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="pointer-events-auto flex flex-wrap items-end justify-end gap-2">
          {/* Archive status moved to the sidebar (components/ArchiveStatus.tsx). */}
          {target && (
            <div className="flex items-stretch overflow-hidden rounded-xl border border-pulse/30 bg-deep/70 text-[11px] backdrop-blur-md transition-colors hover:border-pulse/60">
              <Link
                href={SHOW_EXTRA_PAGES ? "/journal" : sequenceUrl(target)}
                className="flex items-center gap-2.5 py-2 pl-3 pr-2 text-mutedstar hover:text-starlight"
              >
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-pulse" />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-[9px] uppercase tracking-[0.16em] text-mutedstar">{t("ongoingLabel")}</span>
                  <span className="text-xs font-semibold text-starlight">{target.name}</span>
                </span>
                <span className="text-pulse" aria-hidden="true">→</span>
                <span className="sr-only">{SHOW_EXTRA_PAGES ? t("ongoingOpen") : t("ongoingOpenExplorer")}</span>
              </Link>
              <button
                type="button"
                onClick={reset}
                aria-label={t("ongoingDismiss")}
                title={t("ongoingDismiss")}
                className="border-l border-line/60 px-2 text-mutedstar transition-colors hover:bg-abyss/60 hover:text-starlight"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
