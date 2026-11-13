"use client";

/**
 * Compact live archive status for the sidebar: connectivity, latency, data release and UTC.
 * Every figure comes from `useDataSources()`; the long text (every source, every release,
 * the archive note) lives in a tooltip so the widget stays small.
 */

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Info, RefreshCw } from "lucide-react";
import { useDataSources } from "@/components/StatusBanner";

function UtcClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <b className="font-mono font-medium text-starlight">{now ?? "--:--:--"}</b>;
}

export default function ArchiveStatus() {
  const t = useTranslations("archiveStatus");
  const tb = useTranslations("statusBanner");
  const { sources, note, collections, error, loading, refresh } = useDataSources();
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  /** Only the "+N" count and the info icon open the tooltip (hover or keyboard focus). */
  const trigger = {
    "aria-describedby": tooltipId,
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
    onKeyDown: (e: React.KeyboardEvent) => e.key === "Escape" && setOpen(false),
  };

  const online = !loading && !error && !!sources?.length && sources.every((s) => s.reachable);
  const state = loading ? "checking" : online ? "online" : "offline";
  const dot = loading ? "bg-gold" : online ? "bg-pulse" : "bg-red-400";
  const latency = sources?.find((s) => s.latency_ms != null)?.latency_ms;
  const releases = collections?.used ?? [];

  return (
    <>
      {/* Icon-only sidebar (below md): just the status light. */}
      <span
        className={`mx-auto block h-2 w-2 rounded-full md:hidden ${dot}`}
        title={`${t("label")}: ${t(state)}`}
        aria-label={`${t("label")}: ${t(state)}`}
        role="img"
      />

      <div className="relative hidden rounded-xl border border-line/70 bg-abyss/50 p-3 text-[11px] md:block">
        <div className="flex items-center justify-between">
          <span className="text-mutedstar">IRSA</span>
          <span className="flex items-center gap-1.5 text-pulse">
            <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
            {t(state)}
          </span>
        </div>

        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-mutedstar">{t("latency")}</span>
          <b className="font-mono font-medium text-starlight">{latency != null ? t("latencyValue", { ms: latency }) : "—"}</b>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-mutedstar">{t("release")}</span>
          <b className="truncate font-mono font-medium text-starlight">
            {releases[0] ?? "—"}
            {releases.length > 1 && (
              <button
                type="button"
                {...trigger}
                aria-label={t("details")}
                className="ml-1 cursor-help rounded text-mutedstar hover:text-starlight focus-visible:text-starlight focus-visible:outline-none"
              >
                +{releases.length - 1}
              </button>
            )}
          </b>
        </div>

        <div className="mt-1.5 flex items-center justify-between border-t border-line/60 pt-1.5">
          <span className="text-mutedstar">{t("utc")}</span>
          <UtcClock />
        </div>

        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => void refresh()}
            className="flex items-center gap-1 text-mutedstar hover:text-starlight"
            title={t("recheck")}
            aria-label={t("recheck")}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            {...trigger}
            aria-label={t("details")}
            className="cursor-help text-mutedstar hover:text-starlight focus-visible:text-starlight focus-visible:outline-none"
          >
            <Info size={13} />
          </button>
        </div>

        <div
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute inset-x-0 bottom-full z-30 mb-2 rounded-xl border border-line/70 bg-deep p-3 text-[11px] leading-snug text-mutedstar shadow-xl transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        >
          {error && <p className="text-red-300">{error}</p>}
          {sources?.map((s) => (
            <p key={s.name} className="text-starlight">
              {s.reachable
                ? t("sourceUp", { name: s.name, latency: s.latency_ms ?? "—" })
                : t("sourceDown", { name: s.name, detail: s.detail })}
            </p>
          ))}
          {releases.length > 0 && <p className="mt-1.5">{tb("releases", { releases: releases.join(", ") })}</p>}
          {collections?.source === "configured" && <p className="mt-1.5 text-gold">{tb("configuredFallback")}</p>}
          {note && <p className="mt-1.5">{note}</p>}
        </div>
      </div>
    </>
  );
}
