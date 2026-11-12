"use client";

/** Shared sky viewport: 3D sphere with 2D fallback, layers, FOV, reset. */

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useState } from "react";
import { Layers, RotateCcw } from "lucide-react";
import SkyFallback2D from "./SkyFallback2D";
import { api } from "@/lib/api";
import { useErrorText } from "@/lib/errors";
import { useResearch } from "@/lib/store";
import type { Candidate, Observation, ReferenceStar } from "@/lib/types";
import type { SkyLayers } from "./CelestialSphere";

function SphereLoading() {
  const t = useTranslations("skyView");
  return <div className="flex h-full items-center justify-center text-xs text-mutedstar">{t("loadingSphere")}</div>;
}

const CelestialSphere = dynamic(() => import("./CelestialSphere"), {
  ssr: false,
  loading: () => <SphereLoading />,
});

type LoadSource = "referenceStars" | "candidates";

const LAYER_KEYS: Array<keyof SkyLayers> = ["grid", "references", "footprints", "candidates", "labels"];

interface Props {
  observations: Observation[];
  controls?: boolean;
  onSelectObservation?: (o: Observation) => void;
}

export default function SkyView({ observations, controls = true, onSelectObservation }: Props) {
  const t = useTranslations("skyView");
  const errorText = useErrorText();
  const router = useRouter();
  const { target, candidates, setCandidates, focusTarget } = useResearch();
  const [stars, setStars] = useState<ReferenceStar[]>([]);
  const [layers, setLayers] = useState<SkyLayers>({
    grid: true,
    references: true,
    footprints: true,
    candidates: true,
    labels: true,
  });
  const [fov, setFov] = useState(55);
  const [resetNonce, setResetNonce] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [loadErrors, setLoadErrors] = useState<Array<{ source: LoadSource; error: unknown }>>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const fn = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .referenceStars()
      .then((rows) => !cancelled && setStars(rows))
      .catch((e) => !cancelled && setLoadErrors((prev) => [...prev, { source: "referenceStars", error: e }]));
    api
      .candidates()
      .then((rows) => !cancelled && setCandidates(rows))
      .catch((e) => !cancelled && setLoadErrors((prev) => [...prev, { source: "candidates", error: e }]));
    return () => {
      cancelled = true;
    };
  }, [setCandidates]);

  const selectCandidate = useCallback(
    (c: Candidate) => {
      sessionStorage.setItem("origin-candidate", String(c.id));
      router.push("/candidates");
    },
    [router]
  );

  const toggle = (key: keyof SkyLayers) => setLayers((l) => ({ ...l, [key]: !l[key] }));

  return (
    <div className="relative h-full w-full">
      <CelestialSphere
        target={target}
        observations={observations}
        referenceStars={stars}
        candidates={candidates}
        layers={layers}
        fov={fov}
        focus={focusTarget}
        resetNonce={resetNonce}
        reducedMotion={reducedMotion}
        onSelectObservation={onSelectObservation ?? (() => {})}
        onSelectCandidate={selectCandidate}
        fallback={
          <SkyFallback2D
            target={target}
            observations={observations}
            referenceStars={stars}
            candidates={candidates}
            onSelectObservation={onSelectObservation ?? (() => {})}
          />
        }
      />
      {loadErrors.length > 0 && (
        <div
          role="alert"
          className="absolute left-2 top-2 max-w-xs rounded border border-red-400/40 bg-abyss/95 p-2 text-[11px] text-red-300"
        >
          <p className="font-semibold">{t("loadErrorTitle")}</p>
          <ul className="mt-0.5">
            {loadErrors.map((m, i) => (
              <li key={i}>
                · {t("loadError", { source: t(`sources.${m.source}`), message: errorText(m.error, t("unexpectedError")) })}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-mutedstar">{t("loadErrorNote")}</p>
        </div>
      )}
      {controls && (
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowLayers((v) => !v)}
              title={t("layersButton")}
              aria-label={t("layersButton")}
              className="rounded border border-line bg-abyss/85 p-1.5 text-mutedstar hover:text-starlight"
            >
              <Layers size={15} />
            </button>
            <button
              onClick={() => setResetNonce((n) => n + 1)}
              title={t("reset")}
              aria-label={t("reset")}
              className="rounded border border-line bg-abyss/85 p-1.5 text-mutedstar hover:text-starlight"
            >
              <RotateCcw size={15} />
            </button>
          </div>
          {showLayers && (
            <div className="rounded border border-line bg-abyss/95 p-2 text-[11px] text-mutedstar">
              {LAYER_KEYS.map((key) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() => toggle(key)}
                    className="accent-[#46d8ff]"
                  />
                  {t(`layers.${key}`)}
                </label>
              ))}
              <label className="mt-1 flex items-center gap-2 border-t border-line pt-1">
                {t("fov")}
                <input
                  type="range"
                  min={25}
                  max={90}
                  value={fov}
                  onChange={(e) => setFov(Number(e.target.value))}
                  className="w-20"
                  aria-label={t("fov")}
                />
                {fov}°
              </label>
              <label className="flex cursor-pointer items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(e) => setReducedMotion(e.target.checked)}
                  className="accent-[#46d8ff]"
                />
                {t("reducedMotion")}
              </label>
            </div>
          )}
        </div>
      )}
      <p className="pointer-events-none absolute bottom-1.5 left-2 text-[10px] text-mutedstar/80">
        {t("hint")}
      </p>
    </div>
  );
}
