"use client";

/** OBSERVATORY — entry screen: live sky, search, three actions, real status. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Clock3, Crosshair, Orbit, RefreshCw } from "lucide-react";
import VirtualSkyViewer from "@/components/VirtualSkyViewer";
import SearchBar from "@/components/SearchBar";
import { StatusDot, useDataSources } from "@/components/StatusBanner";
import { useResearch } from "@/lib/store";

/** Galactic center: pleasant default while no target is selected. */
const DEFAULT_RA = 266.4051;
const DEFAULT_DEC = -29.0078;

export default function Observatory() {
  const router = useRouter();
  const { target } = useResearch();
  const { sources, note, error, loading, refresh } = useDataSources();

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <VirtualSkyViewer
          ra={target?.ra_deg ?? DEFAULT_RA}
          dec={target?.dec_deg ?? DEFAULT_DEC}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 md:p-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="pointer-events-auto max-w-xl"
        >
          <p className="text-[11px] tracking-[0.25em] text-pulse">ASTRA TRACE · SPHEREx</p>
          <h1 className="mt-1 text-3xl font-bold text-starlight md:text-4xl">
            The living sky, observed for real.
          </h1>
          <p className="mt-1 max-w-md text-xs text-mutedstar md:text-sm">
            Explora observaciones infrarrojas de la misión SPHEREx, viaja entre épocas y
            comprende qué cambió — con evidencia.
          </p>
          <div className="mt-3">
            <SearchBar />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => router.push("/living-sky")}
              className="flex items-center gap-1.5 rounded bg-pulse px-3 py-2 text-xs font-bold text-abyss hover:brightness-110"
            >
              <Orbit size={14} /> EXPLORE THE SKY
            </button>
            <button
              onClick={() => router.push(target ? "/living-sky" : "/living-sky")}
              className="flex items-center gap-1.5 rounded border border-line bg-abyss/80 px-3 py-2 text-xs font-semibold text-starlight hover:border-pulse"
            >
              <Crosshair size={14} /> FIND AN OBJECT
            </button>
            <button
              onClick={() => router.push("/time-explorer")}
              className="flex items-center gap-1.5 rounded border border-gold/60 bg-abyss/80 px-3 py-2 text-xs font-semibold text-gold hover:border-gold"
            >
              <Clock3 size={14} /> WATCH THE UNIVERSE CHANGE
            </button>
          </div>
        </motion.div>

        <div className="pointer-events-auto flex flex-wrap items-end justify-between gap-2">
          <div className="max-w-md rounded border border-line bg-abyss/85 p-2.5 text-[11px]">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="font-semibold text-starlight">SPHEREx · IRSA</span>
              <button
                onClick={() => void refresh()}
                className="flex items-center gap-1 text-mutedstar hover:text-starlight"
                title="Volver a comprobar"
              >
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> comprobar
              </button>
            </div>
            {loading && <p className="text-mutedstar">Consultando el archivo…</p>}
            {error && <p className="text-red-300">{error}</p>}
            {sources?.map((s) => (
              <p key={s.name} className="flex items-center gap-1.5 text-mutedstar">
                <StatusDot ok={s.reachable} pending={loading} />
                {s.name}: {s.reachable ? `disponible (${s.latency_ms} ms)` : `no disponible — ${s.detail}`}
              </p>
            ))}
            {note && <p className="mt-1 text-mutedstar/70">{note}</p>}
          </div>
          {target && (
            <Link
              href="/journal"
              className="rounded border border-line bg-abyss/85 px-3 py-2 text-[11px] text-mutedstar hover:text-starlight"
            >
              Investigación en curso: <span className="text-starlight">{target.name}</span> → Journal
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
