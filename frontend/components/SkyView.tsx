"use client";

/** Shared sky viewport: 3D sphere with 2D fallback, layers, FOV, reset. */

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Layers, RotateCcw } from "lucide-react";
import SkyFallback2D from "./SkyFallback2D";
import { ApiError, api } from "@/lib/api";
import { useResearch } from "@/lib/store";
import type { Candidate, Observation, ReferenceStar } from "@/lib/types";
import type { SkyLayers } from "./CelestialSphere";

const CelestialSphere = dynamic(() => import("./CelestialSphere"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-mutedstar">
      Cargando esfera celeste…
    </div>
  ),
});

interface Props {
  observations: Observation[];
  controls?: boolean;
  onSelectObservation?: (o: Observation) => void;
}

export default function SkyView({ observations, controls = true, onSelectObservation }: Props) {
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
  const [loadErrors, setLoadErrors] = useState<string[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const fn = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const describe = (what: string, e: unknown) =>
      `${what}: ${e instanceof ApiError ? e.message : "error inesperado"}`;
    api
      .referenceStars()
      .then((rows) => !cancelled && setStars(rows))
      .catch((e) => !cancelled && setLoadErrors((prev) => [...prev, describe("Estrellas de referencia", e)]));
    api
      .candidates()
      .then((rows) => !cancelled && setCandidates(rows))
      .catch((e) => !cancelled && setLoadErrors((prev) => [...prev, describe("Candidatos", e)]));
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
          <p className="font-semibold">No se pudieron cargar datos del servicio</p>
          <ul className="mt-0.5">
            {loadErrors.map((m, i) => (
              <li key={i}>· {m}</li>
            ))}
          </ul>
          <p className="mt-1 text-mutedstar">La esfera muestra solo lo que sí se cargó.</p>
        </div>
      )}
      {controls && (
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowLayers((v) => !v)}
              title="Capas"
              aria-label="Capas"
              className="rounded border border-line bg-abyss/85 p-1.5 text-mutedstar hover:text-starlight"
            >
              <Layers size={15} />
            </button>
            <button
              onClick={() => setResetNonce((n) => n + 1)}
              title="Restablecer vista"
              aria-label="Restablecer vista"
              className="rounded border border-line bg-abyss/85 p-1.5 text-mutedstar hover:text-starlight"
            >
              <RotateCcw size={15} />
            </button>
          </div>
          {showLayers && (
            <div className="rounded border border-line bg-abyss/95 p-2 text-[11px] text-mutedstar">
              {(
                [
                  ["grid", "Malla de coordenadas"],
                  ["references", "Estrellas de referencia (catálogo)"],
                  ["footprints", "Huellas SPHEREx consultadas"],
                  ["candidates", "Candidatos"],
                  ["labels", "Etiquetas"],
                ] as Array<[keyof SkyLayers, string]>
              ).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() => toggle(key)}
                    className="accent-[#46d8ff]"
                  />
                  {label}
                </label>
              ))}
              <label className="mt-1 flex items-center gap-2 border-t border-line pt-1">
                Campo de visión
                <input
                  type="range"
                  min={25}
                  max={90}
                  value={fov}
                  onChange={(e) => setFov(Number(e.target.value))}
                  className="w-20"
                  aria-label="Campo de visión"
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
                Movimiento reducido
              </label>
            </div>
          )}
        </div>
      )}
      <p className="pointer-events-none absolute bottom-1.5 left-2 text-[10px] text-mutedstar/80">
        Esfera celeste: direcciones, no distancias. Arrastra para explorar · rueda para acercar.
      </p>
    </div>
  );
}
