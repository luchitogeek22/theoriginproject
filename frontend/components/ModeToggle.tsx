"use client";

import { useTranslations } from "next-intl";
import { useResearch } from "@/lib/store";

/** Explore / Investigate switch. Preserves all research state. */
export default function ModeToggle() {
  const { mode, setMode } = useResearch();
  const t = useTranslations("mode");
  return (
    <div className="flex rounded-full border border-line/80 bg-abyss/60 p-0.5 text-[11px]" role="tablist" aria-label={t("label")}>
      {(["explore", "investigate"] as const).map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={mode === m}
          onClick={() => setMode(m)}
          className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
            mode === m ? "bg-pulse text-starlight" : "text-mutedstar hover:text-starlight"
          }`}
        >
          {t(m)}
        </button>
      ))}
    </div>
  );
}
