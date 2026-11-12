"use client";

import { useTranslations } from "next-intl";
import { useResearch } from "@/lib/store";

/** Explore / Investigate switch. Preserves all research state. */
export default function ModeToggle() {
  const { mode, setMode } = useResearch();
  const t = useTranslations("mode");
  return (
    <div className="flex rounded border border-line bg-deep p-0.5 text-[11px]" role="tablist" aria-label={t("label")}>
      {(["explore", "investigate"] as const).map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={mode === m}
          onClick={() => setMode(m)}
          className={`rounded px-2.5 py-1 transition-colors ${
            mode === m ? "bg-panel text-pulse" : "text-mutedstar hover:text-starlight"
          }`}
        >
          {t(m)}
        </button>
      ))}
    </div>
  );
}
