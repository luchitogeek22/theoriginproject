"use client";

/** VirtualSky ultralight sky viewer (LCO / Stuart Lowe, Canvas 2D).
 *
 * Loads stuquery (the `S` helper) + virtualsky in order, mounts with
 * S.virtualsky({ id: "starmap", ... }), and instantly recenters with the
 * native setRA/setDec/draw methods whenever (ra, dec) change
 * (e.g. Mars at 145.1227, 15.7976).
 */

import { useEffect, useRef, useState } from "react";

const STUQUERY_URLS = [
  "https://cdn.jsdelivr.net/gh/slowe/VirtualSky@gh-pages/stuquery.min.js",
  "https://raw.githubusercontent.com/slowe/VirtualSky/gh-pages/stuquery.min.js",
];
const VIRTUALSKY_URLS = [
  "https://cdn.jsdelivr.net/gh/slowe/VirtualSky@gh-pages/virtualsky.min.js",
  "https://raw.githubusercontent.com/slowe/VirtualSky/gh-pages/virtualsky.min.js",
];

export const VIRTUALSKY_DEFAULT_FOV = 55;

interface VirtualSkyInstance {
  setRA: (ra: number) => VirtualSkyInstance;
  setDec: (dec: number) => VirtualSkyInstance;
  draw: () => VirtualSkyInstance;
  panTo: (ra: number, dec: number, durationMs: number) => VirtualSkyInstance;
}

interface StuQueryStatic {
  virtualsky: (options: Record<string, unknown>) => VirtualSkyInstance;
}

declare global {
  interface Window {
    S?: StuQueryStatic;
  }
}

interface Props {
  ra: number;
  dec: number;
  fov?: number;
  projection?: string;
  /** Container id. Override when mounting more than one viewer per page. */
  containerId?: string;
  className?: string;
}

/** Both scripts load once per page lifetime, shared across mounts/remounts. */
let libsPromise: Promise<void> | null = null;

const SCRIPT_TIMEOUT_MS = 15000;

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve(); // already loading or loaded
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false; // preserve execution order (stuquery before virtualsky)
    const timer = window.setTimeout(() => {
      script.onload = null;
      script.onerror = null;
      reject(new Error(`Timed out loading: ${src}`));
    }, SCRIPT_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error(`Could not load: ${src}`));
    };
    document.head.appendChild(script);
  });
}

async function loadWithFallback(urls: string[]): Promise<void> {
  const failures: string[] = [];
  for (const url of urls) {
    try {
      await injectScript(url);
      return;
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(failures.join(" | "));
}

function loadVirtualSkyLibs(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("window unavailable"));
  if (window.S && typeof window.S.virtualsky === "function") return Promise.resolve();
  if (libsPromise) return libsPromise;
  libsPromise = (async () => {
    // Order matters: virtualsky evaluates against the global S at load time.
    await loadWithFallback(STUQUERY_URLS);
    await loadWithFallback(VIRTUALSKY_URLS);
    if (!window.S || typeof window.S.virtualsky !== "function") {
      throw new Error("VirtualSky scripts loaded but S.virtualsky is missing");
    }
  })();
  libsPromise.catch(() => {
    libsPromise = null; // allow retry after failure
  });
  return libsPromise;
}

function normalizeRa(ra: number): number {
  return ((ra % 360) + 360) % 360;
}

function clampDec(dec: number): number {
  return Math.min(90, Math.max(-90, dec));
}

export default function VirtualSkyViewer({
  ra,
  dec,
  fov = VIRTUALSKY_DEFAULT_FOV,
  projection = "stereo",
  containerId = "starmap",
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<VirtualSkyInstance | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const targetRef = useRef({ ra, dec, fov, projection });
  targetRef.current = { ra, dec, fov, projection };

  // Mount once: load the libs, then init the planetarium into the container.
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    setStatus("loading");
    setError("");
    loadVirtualSkyLibs()
      .then(() => {
        if (cancelled || !containerRef.current || !window.S) return;
        container.innerHTML = ""; // fresh mount (StrictMode safe)
        const current = targetRef.current;
        const instance = window.S.virtualsky({
          id: containerId,
          projection: current.projection,
          ra: normalizeRa(current.ra),
          dec: clampDec(current.dec),
          fov: current.fov,
          ground: false,
          constellations: true,
          constellationlabels: true,
          mouse: true,
          keyboard: true,
          showdate: false,
          showposition: false,
          clock: false,
        });
        if (cancelled) return;
        instanceRef.current = instance;
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error("[virtualsky] failed:", e);
        setError(e instanceof Error ? e.message : "VirtualSky failed to load");
        setStatus("error");
      });
    return () => {
      cancelled = true;
      instanceRef.current = null;
    };
  }, [containerId]);

  // Instantly recenter the projection whenever coordinates change.
  useEffect(() => {
    const instance = instanceRef.current;
    if (status !== "ready" || !instance) return;
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) return;
    try {
      instance.setRA(normalizeRa(ra));
      instance.setDec(clampDec(dec));
      instance.draw();
    } catch (e) {
      console.warn("[virtualsky] recenter failed:", e);
    }
  }, [ra, dec, status]);

  return (
    <div className={`relative h-full w-full z-0 bg-abyss ${className}`}>
      <div id={containerId} ref={containerRef} className="relative h-full w-full z-0" />
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded border border-line bg-abyss/85 px-3 py-1.5 text-xs text-mutedstar">
            Cargando VirtualSky…
          </p>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="max-w-sm rounded border border-line bg-deep p-4 text-center">
            <p className="text-sm font-semibold text-starlight">Visor no disponible</p>
            <p className="mt-1 text-xs text-mutedstar">
              {error}. Revisa tu conexión con cdn.jsdelivr.net.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
