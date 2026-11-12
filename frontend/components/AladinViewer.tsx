"use client";

import { useEffect, useRef, useState } from "react";

export const ALADIN_VERSION = "3.6.1";
export const ALADIN_SCRIPT_URL = `https://aladin.cds.unistra.fr/AladinLite/api/v3/${ALADIN_VERSION}/aladin.js`;
export const ALADIN_BASE_SURVEY = "P/2MASS/color";

const SCRIPT_TIMEOUT_MS = 15000;
const POLL_TIMEOUT_MS = 8000;

export const CATALOG_LAYERS = {
  gaia: { label: "Gaia DR3 (flujo G)", hips: "CDS/P/DM/flux-G/I/355/gaiadr3" },
  wise: { label: "WISE (color)", hips: "P/allWISE/color" },
} as const;

export type CatalogLayerKey = keyof typeof CATALOG_LAYERS;

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

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    const timer = window.setTimeout(() => reject(new Error("tiempo agotado al cargar el script")), SCRIPT_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      script.remove();
      reject(new Error("no se pudo descargar el script"));
    };
    document.head.appendChild(script);
  });
}

function waitForGlobal(): Promise<AladinGlobal> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poller = window.setInterval(() => {
      if (validApi(window.A)) {
        window.clearInterval(poller);
        resolve(window.A);
      } else if (Date.now() - started > POLL_TIMEOUT_MS) {
        window.clearInterval(poller);
        reject(new Error("el script cargó pero no expuso la API"));
      }
    }, 100);
  });
}

function loadAladin(): Promise<AladinGlobal> {
  if (validApi(window.A)) return window.A.init.then(() => window.A as AladinGlobal);
  if (apiPromise) return apiPromise;
  apiPromise = (async () => {
    await injectScript(ALADIN_SCRIPT_URL);
    const api = await waitForGlobal();
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
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<AladinInstance | null>(null);
  const apiRef = useRef<AladinGlobal | null>(null);
  const markerCatalogRef = useRef<AladinCatalog | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [active, setActive] = useState<Record<CatalogLayerKey, boolean>>({ gaia: false, wise: false });
  const [layerError, setLayerError] = useState("");
  const initial = useRef({ ra, dec, fovArcmin });
  initial.current = { ra, dec, fovArcmin };

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    setStatus("loading");
    setError("");
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
        setError(e instanceof Error ? e.message : "fallo desconocido");
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
      setLayerError("El visor no pudo recentrarse en la posición pedida.");
    }
  }, [ra, dec, fovArcmin, status]);

  useEffect(() => {
    const instance = instanceRef.current;
    const api = apiRef.current;
    if (status !== "ready" || !instance || !api) return;
    try {
      if (!markerCatalogRef.current) {
        const catalog = api.catalog({ name: "Objetivo", shape: "circle", sourceSize: 22, color: "#ffd166" });
        instance.addCatalog(catalog);
        markerCatalogRef.current = catalog;
      }
      markerCatalogRef.current.removeAll();
      if (marker) {
        markerCatalogRef.current.addSources([api.source(marker.ra, marker.dec, { name: marker.label })]);
      }
    } catch {
      setLayerError("No se pudo dibujar el marcador del objetivo.");
    }
  }, [marker?.ra, marker?.dec, marker?.label, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: CatalogLayerKey) => {
    const instance = instanceRef.current;
    const api = apiRef.current;
    if (!instance || !api) return;
    const next = !active[key];
    setLayerError("");
    try {
      if (next) {
        const layer = api.imageHiPS(CATALOG_LAYERS[key].hips, { name: CATALOG_LAYERS[key].label });
        instance.setOverlayImageLayer(layer, key);
        layer.setOpacity?.(0.65);
      } else {
        instance.removeImageLayer(key);
      }
      setActive((a) => ({ ...a, [key]: next }));
    } catch {
      setLayerError(`No se pudo ${next ? "activar" : "desactivar"} la capa ${CATALOG_LAYERS[key].label}.`);
    }
  };

  return (
    <div className={`flex h-full w-full flex-col ${className}`}>
      <div className="relative min-h-0 flex-1 bg-abyss">
        <div id={containerId} ref={containerRef} className="h-full w-full" aria-label="Mapa del cielo Aladin Lite" />
        {status === "loading" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded border border-line bg-abyss/85 px-3 py-1.5 text-xs text-mutedstar">
              Cargando el mapa del cielo (Aladin Lite {ALADIN_VERSION})…
            </p>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center p-4" role="alert">
            <div className="max-w-sm rounded border border-line bg-deep p-4 text-center">
              <p className="text-sm font-semibold text-starlight">Mapa del cielo no disponible</p>
              <p className="mt-1 text-xs text-mutedstar">
                No se pudo cargar Aladin Lite ({error}). La secuencia de imágenes sigue funcionando; revisa tu
                conexión con aladin.cds.unistra.fr y recarga la página.
              </p>
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
            {CATALOG_LAYERS[key].label}
          </label>
        ))}
        {marker && <span className="text-gold">● {marker.label}</span>}
        {layerError && <span className="text-red-300">{layerError}</span>}
      </div>
    </div>
  );
}
