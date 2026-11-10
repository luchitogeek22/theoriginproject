"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crosshair, Loader2, Search } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { useResearch } from "@/lib/store";
import { VALIDATION_TARGETS } from "@/lib/targets";

/** Target search: name / RA DEC / catalog id. Resolves via backend (SIMBAD). */
export default function SearchBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { setTarget, setSearch, clearSelected, requestFocus } = useResearch();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    setBusy(true);
    setError("");
    try {
      // "RA DEC" numeric pair?
      const parts = q.split(/[\s,;]+/);
      let target;
      if (parts.length === 2 && parts.every((p) => Number.isFinite(Number(p)))) {
        target = await api.resolveTarget({ ra_deg: Number(parts[0]), dec_deg: Number(parts[1]) });
      } else {
        target = await api.resolveTarget({ name: q });
      }
      setTarget(target);
      setSearch(null);
      clearSelected();
      requestFocus(target.ra_deg, target.dec_deg);
      const search = await api.searchObservations({
        ra_deg: target.ra_deg,
        dec_deg: target.dec_deg,
        radius_arcmin: 12,
      });
      setSearch(search);
      router.push("/living-sky");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "" : "w-[min(92vw,560px)]"}>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mutedstar" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void run(query)}
            placeholder="Nombre, «RA DEC» o ID de catálogo — prueba WISE 0855"
            aria-label="Buscar objetivo"
            className="w-full rounded border border-line bg-deep/90 py-2 pl-8 pr-2 text-sm text-starlight outline-none placeholder:text-mutedstar/60 focus:border-pulse"
          />
        </div>
        <button
          onClick={() => void run(query)}
          disabled={busy}
          className="flex items-center gap-1.5 rounded bg-pulse px-3 text-sm font-semibold text-abyss hover:brightness-110 disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Crosshair size={15} />}
          Observar
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
      {!compact && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {VALIDATION_TARGETS.map((t) => (
            <button
              key={t.key}
              title={t.hint}
              onClick={() => {
                setQuery(t.name);
                void run(t.name);
              }}
              className="rounded-full border border-line bg-deep/70 px-2.5 py-1 text-[11px] text-mutedstar hover:border-pulse hover:text-starlight"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
