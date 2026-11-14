"use client";

/** SPECTRAL LAB — the measured multi-detector spectrum of the current target. The same panel
 * is reachable inside the time explorer; this page only exists with
 * `NEXT_PUBLIC_SHOW_EXTRA_PAGES=true` (see `lib/features.ts` and `middleware.ts`).
 */

import { useTranslations } from "next-intl";
import SpectrumPanel from "@/components/SpectrumPanel";
import { useResearch } from "@/lib/store";

export default function SpectralLab() {
  const t = useTranslations("spectralLabPage");
  const { target } = useResearch();

  return (
    <div className="scroll-thin h-full overflow-y-auto p-3 md:p-4">
      <h1 className="mb-2 text-lg font-bold text-starlight">{t("title")}</h1>
      {target ? (
        <SpectrumPanel ra={target.propagated_ra_deg ?? target.ra_deg} dec={target.propagated_dec_deg ?? target.dec_deg} />
      ) : (
        <p className="mt-4 text-xs text-mutedstar">{t("chooseTarget")}</p>
      )}
    </div>
  );
}
