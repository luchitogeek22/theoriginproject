"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import type { NeossatCoverage } from "@/lib/types";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; coverage: NeossatCoverage };

/** CSA NEOSSat coverage of the requested position (CADC archive). Mounted only when its panel is open. */
export default function NeossatPanel({ ra, dec }: { ra: number; dec: number }) {
  const t = useTranslations("neossatPanel");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    api
      .neossatCoverage(ra, dec)
      .then((coverage) => !cancelled && setState({ kind: "ready", coverage }))
      .catch(() => !cancelled && setState({ kind: "error" }));
    return () => {
      cancelled = true;
    };
  }, [ra, dec]);

  return (
    <div className="space-y-2 p-3 text-xs text-mutedstar" data-testid="neossat-panel" aria-live="polite">
      {state.kind === "loading" && <p>{t("loading")}</p>}
      {state.kind === "error" && <p className="text-pulse">{t("error")}</p>}
      {state.kind === "ready" && (
        <>
          <p className="text-starlight" data-testid="neossat-summary">
            {state.coverage.count > 0
              ? t("found", {
                  count: state.coverage.count,
                  first: state.coverage.first_date ?? "",
                  last: state.coverage.last_date ?? "",
                  radius: state.coverage.radius_deg,
                })
              : t("none", { radius: state.coverage.radius_deg })}
          </p>
          <p>{t("context")}</p>
          <a
            href={state.coverage.collection_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded border border-line px-2 py-1 text-starlight hover:border-pulse"
          >
            {t("open")}
          </a>
        </>
      )}
    </div>
  );
}
