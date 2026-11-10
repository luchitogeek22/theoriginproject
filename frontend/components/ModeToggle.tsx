"use client";

import { useResearch } from "@/lib/store";

/** Explore / Investigate switch. Preserves all research state. */
export default function ModeToggle() {
  const { mode, setMode } = useResearch();
  return (
    <div className="flex rounded border border-line bg-deep p-0.5 text-[11px]" role="tablist" aria-label="Modo">
      {(["explore", "investigate"] as const).map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={mode === m}
          onClick={() => setMode(m)}
          className={`rounded px-2.5 py-1 capitalize transition-colors ${
            mode === m ? "bg-panel text-pulse" : "text-mutedstar hover:text-starlight"
          }`}
        >
          {m === "explore" ? "Explore" : "Investigate"}
        </button>
      ))}
    </div>
  );
}
