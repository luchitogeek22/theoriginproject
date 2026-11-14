"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

// CDS stopped serving aladin.cds.unistra.fr/AladinLite/api/v3/* (404, 2026-11-13); use the npm build.
export const ALADIN_VERSION = "3.6.5";
export const ALADIN_SCRIPT_URL = `https://cdn.jsdelivr.net/npm/aladin-lite@${ALADIN_VERSION}/dist/aladin.js`;
// SPHEREx DR1 all-sky cube (DOI 10.26131/IRSA679), PNG tiles served by IRSA; replaces the CDS-hosted 2MASS base.
export const ALADIN_BASE_SURVEY = "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube";

const SCRIPT_TIMEOUT_MS = 15000;

/** HiPS overlays; their visible names live in the `aladinViewer.layers` messages. */
export const CATALOG_LAYERS = {
  gaia: { hips: "CDS/P/DM/flux-G/I/355/gaiadr3" },
  wise: { hips: "P/allWISE/color" },
} as const;

export type CatalogLayerKey = keyof typeof CATALOG_LAYERS;

type LoadFailureReason = "timeout" | "download" | "noApi";

/** Loader failure with a translatable reason; `message` stays in English for logs. */
class AladinLoadError extends Error {
  constructor(
    readonly reason: LoadFailureReason,
    message: string
  ) {
    super(message);
  }
}

type LayerIssue =
  | { kind: "recenter" | "marker" }
  | { kind: "enable" | "disable"; layer: CatalogLayerKey };

interface AladinLayer {
  setOpacity?: (value: number) => void;
}

interface AladinCatalog {
  addSources: (sources: unknown[]) => void;
  removeAll: () => void;
}

interface AladinInstance {
  gotoRaDec: (ra: number, dec: number) => void;
  setFoV: (fovDeg: number) => void;
  setOverlayImageLayer: (layer: AladinLayer, name: string) => void;
  removeImageLayer: (name: string) => void;
  addCatalog: (catalog: AladinCatalog) => void;
}

interface AladinGlobal {
  init: Promise<unknown>;
  aladin: (selector: string, options: Record<string, unknown>) => AladinInstance;
  imageHiPS: (id: string, options?: Record<string, unknown>) => AladinLayer;
  catalog: (options: Record<string, unknown>) => AladinCatalog;
  source: (ra: number, dec: number, data?: Record<string, unknown>) => unknown;
}

declare global {
  interface Window {
    A?: AladinGlobal;
  }
}

let apiPromise: Promise<AladinGlobal> | null = null;

function validApi(value: unknown): value is AladinGlobal {
  if (!value || typeof value !== "object") return false;
  const api = value as Partial<AladinGlobal>;
  return typeof api.aladin === "function" && !!api.init && typeof api.init.then === "function";
}

/** The npm build is an ES module whose default export is the `A` API; it sets no global. */
async function importModule(src: string): Promise<AladinGlobal> {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new AladinLoadError("timeout", "timed out while loading the script")), SCRIPT_TIMEOUT_MS);
  });
  try {
    const mod = await Promise.race([
      import(/* webpackIgnore: true */ src).catch(() => {
        throw new AladinLoadError("download", "the script could not be downloaded");
      }),
      timeout,
    ]);
    const api: unknown = (mod as { default?: unknown }).default;
    if (!validApi(api)) throw new AladinLoadError("noApi", "the script loaded but did not expose the API");
    window.A = api;
    return api;
  } finally {
    window.clearTimeout(timer);
  }
}

function loadAladin(): Promise<AladinGlobal> {
  if (validApi(window.A)) return window.A.init.then(() => window.A as AladinGlobal);
  if (apiPromise) return apiPromise;
  apiPromise = (async () => {
    const api = await importModule(ALADIN_SCRIPT_URL);
    await api.init;
    return api;
  })();
  apiPromise.catch(() => {
    apiPromise = null;
  });
  return apiPromise;
}

export interface AladinMarker {
  ra: number;
  dec: number;
  label: string;
}

interface Props {
  ra: number;
  dec: number;
  fovArcmin: number;
  marker?: AladinMarker | null;
  containerId?: string;
  className?: string;
}

export default function AladinViewer({
  ra,
  dec,
  fovArcmin,
  marker = null,
  containerId = "aladin-lite-div",
  className = "",
}: Props) {
  const t = useTranslations("aladinViewer");
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<AladinInstance | null>(null);
  const apiRef = useRef<AladinGlobal | null>(null);
  const markerCatalogRef = useRef<AladinCatalog | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // A coded reason is translated at render; any other loader error keeps its own message.
  const [error, setError] = useState<{ reason: LoadFailureReason | "unknown"; detail?: string } | null>(null);
  const [active, setActive] = useState<Record<CatalogLayerKey, boolean>>({ gaia: false, wise: false });
  const [layerError, setLayerError] = useState<LayerIssue | null>(null);
  const initial = useRef({ ra, dec, fovArcmin });
  initial.current = { ra, dec, fovArcmin };

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    setStatus("loading");
    setError(null);
    loadAladin()
      .then((api) => {
        if (cancelled || !containerRef.current) return;
        container.innerHTML = "";
        const start = initial.current;
        const instance = api.aladin(`#${containerId}`, {
          survey: ALADIN_BASE_SURVEY,
          fov: start.fovArcmin / 60,
          target: `${start.ra} ${start.dec}`,
          cooFrame: "J2000",
          showReticle: false,
          showZoomControl: true,
          showFullscreenControl: true,
          showGotoControl: false,
          showLayersControl: false,
          showShareControl: false,
          showSettingsControl: false,
          showContextMenu: false,
          log: false,
        });
        apiRef.current = api;
        instanceRef.current = instance;
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof AladinLoadError) setError({ reason: e.reason });
        else setError({ reason: "unknown", detail: e instanceof Error && e.message ? e.message : undefined });
        setStatus("error");
      });
    return () => {
      cancelled = true;
      instanceRef.current = null;
      markerCatalogRef.current = null;
      setActive({ gaia: false, wise: false });
    };
  }, [containerId]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (status !== "ready" || !instance || !Number.isFinite(ra) || !Number.isFinite(dec)) return;
    try {
      instance.gotoRaDec(ra, dec);
      instance.setFoV(fovArcmin / 60);
    } catch {
      setLayerError({ kind: "recenter" });
    }
  }, [ra, dec, fovArcmin, status]);

  useEffect(() => {
    const instance = instanceRef.current;
    const api = apiRef.current;
    if (status !== "ready" || !instance || !api) return;
    try {
      if (!markerCatalogRef.current) {
        const catalog = api.catalog({ name: t("markerCatalog"), shape: "circle", sourceSize: 22, color: "#ffd166" });
        instance.addCatalog(catalog);
        markerCatalogRef.current = catalog;
      }
      markerCatalogRef.current.removeAll();
      if (marker) {
        markerCatalogRef.current.addSources([api.source(marker.ra, marker.dec, { name: marker.label })]);
      }
    } catch {
      setLayerError({ kind: "marker" });
    }
  }, [marker?.ra, marker?.dec, marker?.label, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: CatalogLayerKey) => {
    const instance = instanceRef.current;
    const api = apiRef.current;
    if (!instance || !api) return;
    const next = !active[key];
    setLayerError(null);
    try {
      if (next) {
        const layer = api.imageHiPS(CATALOG_LAYERS[key].hips, { name: t(`layers.${key}`) });
        instance.setOverlayImageLayer(layer, key);
        layer.setOpacity?.(0.65);
      } else {
        instance.removeImageLayer(key);
      }
      setActive((a) => ({ ...a, [key]: next }));
    } catch {
      setLayerError({ kind: next ? "enable" : "disable", layer: key });
    }
  };

  const layerErrorText = !layerError
    ? ""
    : layerError.kind === "enable" || layerError.kind === "disable"
      ? t(`issues.${layerError.kind}`, { layer: t(`layers.${layerError.layer}`) })
      : t(`issues.${layerError.kind}`);
  const errorReason = error ? (error.detail ?? t(`reason.${error.reason}`)) : "";

  return (
    <div className={`flex h-full w-full flex-col ${className}`}>
      <div className="relative min-h-0 flex-1 bg-abyss">
        <div id={containerId} ref={containerRef} className="h-full w-full" aria-label={t("ariaLabel")} />
        {status === "loading" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded border border-line bg-abyss/85 px-3 py-1.5 text-xs text-mutedstar">
              {t("loading", { version: ALADIN_VERSION })}
            </p>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center p-4" role="alert">
            <div className="max-w-sm rounded border border-line bg-deep p-4 text-center">
              <p className="text-sm font-semibold text-starlight">{t("errorTitle")}</p>
              <p className="mt-1 text-xs text-mutedstar">{t("errorBody", { reason: errorReason })}</p>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-deep px-2 py-1.5 text-[11px] text-mutedstar">
        {(Object.keys(CATALOG_LAYERS) as CatalogLayerKey[]).map((key) => (
          <label key={key} className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={active[key]}
              disabled={status !== "ready"}
              onChange={() => toggle(key)}
              className="accent-[#46d8ff]"
            />
            {t(`layers.${key}`)}
          </label>
        ))}
        {marker && <span className="text-gold">● {marker.label}</span>}
        {layerErrorText && <span className="text-red-300">{layerErrorText}</span>}
      </div>
    </div>
  );
}
