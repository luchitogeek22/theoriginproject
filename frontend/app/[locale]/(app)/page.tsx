"use client";

/** Entry screen: search, challenge targets, three actions and real archive status. */

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Clock3, Crosshair, Orbit, Play, RefreshCw } from "lucide-react";
import SearchBar from "@/components/SearchBar";
import SkyBackdrop from "@/components/SkyBackdrop";
import { DataRelease, StatusDot, useDataSources } from "@/components/StatusBanner";
import { api } from "@/lib/api";
import { sequenceUrl, targetSequenceRequest } from "@/lib/sequenceParams";
import { useResearch } from "@/lib/store";
import { VALIDATION_TARGETS, type ValidationTarget } from "@/lib/targets";

export default function Home() {
  const router = useRouter();
  const { target } = useResearch();
  const { sources, note, collections, error, loading, refresh } = useDataSources();
  const prefetched = useRef(new Set<string>());
  const [leaving, setLeaving] = useState(false);

  const prefetch = (t: ValidationTarget) => {
    if (prefetched.current.has(t.key)) return;
    prefetched.current.add(t.key);
    api.createSequence(targetSequenceRequest(t, t.mode)).catch(() => {});
  };

  return (
    <div className="scroll-thin relative h-full w-full overflow-y-auto">
      <div
        className="absolute inset-0 bg-abyss"
        style={{ backgroundImage: "radial-gradient(ellipse at 70% 20%, rgba(70,216,255,0.10), transparent 60%)" }}
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
          <p className="text-[11px] tracking-[0.25em] text-pulse">THE ORIGIN PROJECT · SPHEREx</p>
          <h1 className="mt-1 text-3xl font-bold text-starlight md:text-4xl">
            El cielo vivo, observado de verdad.
          </h1>
          <p className="mt-1 max-w-md text-xs text-mutedstar md:text-sm">
            Explora observaciones infrarrojas de la misión SPHEREx, viaja entre épocas y
            comprende qué cambió — con evidencia.
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
              <Play size={14} /> Ver la demo guiada
            </Link>
            <button
              onClick={() => router.push("/living-sky")}
              className="flex items-center gap-1.5 rounded border border-pulse/60 bg-abyss/80 px-3 py-2 text-xs font-semibold text-pulse hover:border-pulse"
            >
              <Orbit size={14} /> Explorar el cielo
            </button>
            <button
              onClick={() => router.push("/living-sky")}
              className="flex items-center gap-1.5 rounded border border-line bg-abyss/80 px-3 py-2 text-xs font-semibold text-starlight hover:border-pulse"
            >
              <Crosshair size={14} /> Buscar un objeto
            </button>
            <button
              onClick={() => router.push(target ? sequenceUrl(target) : "/time-explorer")}
              className="flex items-center gap-1.5 rounded border border-gold/60 bg-abyss/80 px-3 py-2 text-xs font-semibold text-gold hover:border-gold"
            >
              <Clock3 size={14} /> Ver cómo cambia el universo
            </button>
          </div>
        </motion.div>

        <section className="pointer-events-auto" aria-label="Objetivos para empezar">
          <h2 className="text-sm font-semibold text-starlight">Un clic y ves el video</h2>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {VALIDATION_TARGETS.map((t) => (
              <li key={t.key}>
                <Link
                  href={sequenceUrl(t, undefined, t.mode)}
                  onMouseEnter={() => prefetch(t)}
                  onFocus={() => prefetch(t)}
                  className="flex h-full min-h-[120px] flex-col justify-between gap-3 rounded-lg border border-line bg-abyss/85 p-4 hover:border-pulse focus-visible:border-pulse focus-visible:outline-none"
                >
                  <span className="text-base font-semibold leading-snug text-starlight">{t.hook}</span>
                  <span className="flex items-center justify-between text-[11px] text-mutedstar">
                    {t.name}
                    <span className="text-pulse">
                      {t.mode === "motion" ? "Movimiento" : "Brillo"} →
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

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
            <DataRelease collections={collections} />
            {note && <p className="mt-1 text-mutedstar/70">{note}</p>}
          </div>
          {target && (
            <Link
              href="/journal"
              className="rounded border border-line bg-abyss/85 px-3 py-2 text-[11px] text-mutedstar hover:text-starlight"
            >
              Investigación en curso: <span className="text-starlight">{target.name}</span> → Diario
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
