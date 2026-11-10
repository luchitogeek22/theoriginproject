"use client";

/** Aladin Lite v3 interactive sky viewer (official CDS embed).
 *
 * Loads the official script once per page lifetime, mounts the viewer into
 * #aladin-lite-div, and smoothly flies to (ra, dec) whenever they change
 * (e.g. after resolving Mars at 145.1227, 15.7976).
 */

import { useEffect, useRef, useState } from "react";

export const ALADIN_SCRIPT_URL =
  "https://aladin.u-strasbg.fr/AladinLite/api/v3/latest/aladin.js";
/** Verified fallback (npm bundle v3.9.2): used only if the official host fails. */
export const ALADIN_SCRIPT_FALLBACK_URL =
  "https://cdn.jsdelivr.net/npm/aladin-lite@3.9.2-beta/dist/aladin.js";
/** Full HiPS IDs (Aladin resolves these; short aliases like "2MASS/J" may not). */
export const ALADIN_DEFAULT_SURVEY = "P/2MASS/J";
export const ALADIN_DEFAULT_FOV_DEG = 1.5;
/** Galactic center: pleasant default while no target is selected. */
export const ALADIN_DEFAULT_RA = 266.4051;
export const ALADIN_DEFAULT_DEC = -29.0078;

interface AladinInstance {
  gotoRaDec: (ra: number, dec: number) => void;
  setImageSurvey?: (survey: string) => void;
  setFoV?: (fovDeg: number) => void;
  setFov?: (fovDeg: number) => void;
}

interface AladinGlobal {
  init: Promise<unknown>;
  aladin: (target: string, options: Record<string, unknown>) => AladinInstance;
}

declare global {
  interface Window {
    A?: AladinGlobal;
  }
}

interface Props {
  ra: number;
  dec: number;
  survey?: string;
  fov?: number;
  /** Container id. Override when mounting more than one viewer per page. */
  containerId?: string;
  className?: string;
}

/** Aladin API resolves once per page lifetime, shared across mounts/remounts. */
let apiPromise: Promise<AladinGlobal> | null = null;

const TAG_LOAD_TIMEOUT_MS = 15000;
const GLOBAL_POLL_TIMEOUT_MS = 6000;
const GLOBAL_POLL_INTERVAL_MS = 100;
const OFFICIAL_HEAD_START_MS = 3000;
const IMPORT_TIMEOUT_MS = 25000;

export type AladinLoadStage = "official" | "mirror";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function validApi(value: unknown): value is AladinGlobal {
  if (!value || typeof value !== "object") return false;
  const api = value as Partial<AladinGlobal>;
  return typeof api.aladin === "function" && !!api.init && typeof api.init.then === "function";
}

/** Inject a classic <script> tag. Resolves once loaded (the API may appear later). */
function injectScriptTag(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve(); // another mount is handling it; the poll below waits for window.A
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    const timer = window.setTimeout(() => {
      script.onload = null;
      script.onerror = null;
      reject(new Error(`Timed out loading the Aladin Lite script: ${src}`));
    }, TAG_LOAD_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error(`Could not load the Aladin Lite script: ${src}`));
    };
    document.head.appendChild(script);
  });
}

/** Wait for a classic (UMD) bundle to define window.A. */
function pollWindowA(timeoutMs: number): Promise<AladinGlobal> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poller = window.setInterval(() => {
      if (validApi(window.A)) {
        window.clearInterval(poller);
        resolve(window.A);
      } else if (Date.now() - started > timeoutMs) {
        window.clearInterval(poller);
        reject(new Error("window.A never appeared"));
      }
    }, GLOBAL_POLL_INTERVAL_MS);
  });
}

/** Load an ES-module bundle via native dynamic import (never bundled). */
async function loadViaImport(src: string): Promise<AladinGlobal> {
  let mod: unknown;
  try {
    mod = await Promise.race([
      import(/* webpackIgnore: true */ src),
      delay(IMPORT_TIMEOUT_MS).then(() => {
        throw new Error("import timed out");
      }),
    ]);
  } catch (e) {
    throw new Error(
      `Could not import the Aladin Lite module: ${src} (${e instanceof Error ? e.message : String(e)})`
    );
  }
  const candidate =
    mod && typeof mod === "object" && "default" in mod
      ? (mod as { default?: unknown }).default ?? mod
      : mod;
  if (!validApi(candidate)) {
    throw new Error(`Aladin Lite module has no usable API: ${src}`);
  }
  await candidate.init;
  return candidate;
}

async function loadOneSource(src: string, tryTagFirst: boolean): Promise<AladinGlobal> {
  if (tryTagFirst) {
    await injectScriptTag(src); // network failure -> propagate to the next source
    try {
      const api = await pollWindowA(GLOBAL_POLL_TIMEOUT_MS);
      await api.init;
      return api;
    } catch {
      // Tag loaded but no global: fall through to the ES-module import.
    }
  }
  return loadViaImport(src);
}

function loadAladinApi(onStage?: (stage: AladinLoadStage) => void): Promise<AladinGlobal> {
  if (typeof window === "undefined") return Promise.reject(new Error("window unavailable"));
  if (validApi(window.A)) return window.A.init.then(() => window.A as AladinGlobal);
  if (apiPromise) return apiPromise;
  apiPromise = (async () => {
    console.info("[aladin] trying official host");
    onStage?.("official");
    const official = loadOneSource(ALADIN_SCRIPT_URL, true);
    const headStart = await Promise.race([
      official.then(
        (api): { api: AladinGlobal } | { error: unknown } => ({ api }),
        (e: unknown): { api: AladinGlobal } | { error: unknown } => ({ error: e })
      ),
      delay(OFFICIAL_HEAD_START_MS).then(
        (): { api: AladinGlobal } | { error: unknown } | { pending: true } => ({ pending: true })
      ),
    ]);
    if ("api" in headStart) {
      console.info("[aladin] ready via official host");
      return headStart.api;
    }
    if ("error" in headStart) {
      const message =
        headStart.error instanceof Error ? headStart.error.message : String(headStart.error);
      console.warn(`[aladin] official host failed: ${message}`);
      onStage?.("mirror");
      console.info("[aladin] trying jsDelivr mirror");
      // The npm mirror is a verified ES module: import it directly.
      return loadOneSource(ALADIN_SCRIPT_FALLBACK_URL, false);
    }
    // Official is slow but not dead: race it against the mirror.
    onStage?.("mirror");
    console.info("[aladin] official host is slow, racing with jsDelivr mirror");
    const mirror = loadOneSource(ALADIN_SCRIPT_FALLBACK_URL, false);
    return await new Promise<AladinGlobal>((resolve, reject) => {
      const failures: string[] = [];
      const onFailure = (label: string) => (e: unknown) => {
        failures.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
        if (failures.length === 2) reject(new Error(failures.join(" | ")));
      };
      official.then(
        (api) => {
          console.info("[aladin] ready via official host");
          resolve(api);
        },
        onFailure("official")
      );
      mirror.then(
        (api) => {
          console.info("[aladin] ready via jsDelivr mirror");
          resolve(api);
        },
        onFailure("mirror")
      );
    });
  })();
  apiPromise.catch(() => {
    apiPromise = null; // allow retry after failure
  });
  return apiPromise;
}

export default function AladinViewer({
  ra,
  dec,
  survey = ALADIN_DEFAULT_SURVEY,
  fov = ALADIN_DEFAULT_FOV_DEG,
  containerId = "aladin-lite-div",
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<AladinInstance | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [stage, setStage] = useState<AladinLoadStage>("official");
  const targetRef = useRef({ ra, dec, survey, fov });
  targetRef.current = { ra, dec, survey, fov };

  // Mount once: load the script, then init the viewer into the container.
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    setStatus("loading");
    setError("");
    setStage("official");
    loadAladinApi(setStage)
      .then((api) => {
        if (cancelled || !containerRef.current) return;
        container.innerHTML = ""; // fresh mount (StrictMode safe)
        const current = targetRef.current;
        const instance = api.aladin(`#${containerId}`, {
          survey: current.survey,
          fov: current.fov,
          target: `${current.ra} ${current.dec}`,
          cooFrame: "J2000",
          showReticle: true,
          reticleColor: "#46d8ff",
          reticleSize: 22,
          showZoomControl: true,
          showFullscreenControl: true,
          showGotoControl: true,
          showLayersControl: true,
          showShareControl: false,
          showSettingsControl: false,
          showContextMenu: true,
          log: false,
        });
        if (cancelled) return;
        instanceRef.current = instance;
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error("[aladin] failed:", e);
        setError(e instanceof Error ? e.message : "Aladin Lite failed to load");
        setStatus("error");
      });
    return () => {
      cancelled = true;
      instanceRef.current = null;
    };
  }, [containerId]);

  // Fly to new coordinates (and refresh survey/zoom) whenever props change.
  useEffect(() => {
    const instance = instanceRef.current;
    if (status !== "ready" || !instance) return;
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) return;
    try {
      instance.gotoRaDec(ra, dec);
      if (survey) instance.setImageSurvey?.(survey);
      if (Number.isFinite(fov)) {
        if (instance.setFoV) instance.setFoV(fov);
        else if (instance.setFov) instance.setFov(fov);
      }
    } catch (e) {
      /* Keep the current view instead of crashing. */
      console.warn("[aladin] gotoRaDec failed:", e);
    }
  }, [ra, dec, survey, fov, status]);

  return (
    <div className={`relative h-full w-full bg-abyss ${className}`}>
      <div id={containerId} ref={containerRef} className="h-full w-full" />
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded border border-line bg-abyss/85 px-3 py-1.5 text-xs text-mutedstar">
            {stage === "official"
              ? "Cargando Aladin Lite… (aladin.u-strasbg.fr)"
              : "Cargando Aladin Lite… (espejo jsDelivr)"}
          </p>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="max-w-sm rounded border border-line bg-deep p-4 text-center">
            <p className="text-sm font-semibold text-starlight">Visor no disponible</p>
            <p className="mt-1 text-xs text-mutedstar">
              {error}. Revisa tu conexión con aladin.u-strasbg.fr.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
