"use client";

/** PLANET SIMULATOR 3D — illustrative celestial body for the located target.
 *
 * Fully procedural, zero network: a CanvasTexture sphere (bands for gas
 * giants, speckle for rocky bodies) with basic lighting, a subtle atmosphere
 * shell, interactive OrbitControls and gentle axial spin via useFrame.
 * Clearly labeled as illustration — never observed data.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";

interface BodyStyle {
  label: string;
  base: string;
  accent: string;
  bands: boolean;
  atmosphere: string | null;
  emissive: string | null;
}

const ROCKY: BodyStyle = {
  label: "cuerpo rocoso",
  base: "#8a8fa3",
  accent: "#4a5266",
  bands: false,
  atmosphere: null,
  emissive: null,
};

const STYLES: Array<{ match: RegExp; style: BodyStyle }> = [
  {
    match: /mars|marte/i,
    style: { label: "planeta rocoso", base: "#b5533c", accent: "#7a2f22", bands: false, atmosphere: "#ff9a66", emissive: null },
  },
  {
    match: /venus/i,
    style: { label: "planeta rocoso", base: "#d9b77c", accent: "#b78f52", bands: true, atmosphere: "#ffe6b3", emissive: null },
  },
  {
    match: /mercur|moon|luna/i,
    style: { label: "cuerpo rocoso", base: "#8d8d8d", accent: "#555555", bands: false, atmosphere: null, emissive: null },
  },
  {
    match: /earth|tierra/i,
    style: { label: "planeta rocoso", base: "#2f6fdd", accent: "#3fa34d", bands: false, atmosphere: "#6ab8ff", emissive: null },
  },
  {
    match: /jupiter|júpiter|saturn|saturno|gaseos|gas giant|uranus|urano|neptune|neptuno/i,
    style: { label: "gigante gaseoso", base: "#7fa8c9", accent: "#d9e4ec", bands: true, atmosphere: "#9fd0ff", emissive: null },
  },
  {
    match: /exoplanet|kepler|trappist|\btoi-|\bk2-|\blhs|\bgj\b|gliese|wasp|hat-p/i,
    style: { label: "exoplaneta", base: "#5b8dd9", accent: "#bcd6f5", bands: true, atmosphere: "#8fc3ff", emissive: null },
  },
  {
    match: /(^|[\s-])sol([\s-]|$)|sun\b|star|estrella/i,
    style: { label: "estrella", base: "#ffb84d", accent: "#ff8c42", bands: false, atmosphere: "#ffd9a0", emissive: "#ff9d45" },
  },
];

function resolveBodyStyle(targetName: string, kind: string): BodyStyle {
  const haystack = `${kind} ${targetName}`;
  for (const { match, style } of STYLES) {
    if (match.test(haystack)) return style;
  }
  return ROCKY;
}

/** Procedural equirectangular texture drawn on a 2D canvas (no downloads). */
function makeBodyTexture(style: BodyStyle): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.fillStyle = style.base;
  ctx.fillRect(0, 0, w, h);
  if (style.bands) {
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const v = Math.sin(t * Math.PI * 7 + Math.sin(t * 9.2) * 0.6);
      if (v > 0.15) {
        ctx.fillStyle = style.accent;
        ctx.globalAlpha = 0.3 + 0.3 * v;
        ctx.fillRect(0, y, w, 1);
      }
    }
    ctx.globalAlpha = 1;
  } else {
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 0.6 + Math.random() * 2.4;
      ctx.fillStyle = Math.random() < 0.65 ? style.accent : "#ffffff";
      ctx.globalAlpha = 0.1 + Math.random() * 0.22;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Body({ style, spin }: { style: BodyStyle; spin: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const map = useMemo(() => makeBodyTexture(style), [style]);
  useEffect(() => () => map.dispose(), [map]);

  useFrame((_, delta) => {
    if (spin && ref.current) ref.current.rotation.y += delta * 0.25;
  });

  return (
    <group>
      <mesh ref={ref}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial
          map={map}
          bumpMap={map}
          bumpScale={style.bands ? 0.008 : 0.02}
          roughness={0.95}
          metalness={0}
          emissive={style.emissive ?? "#000000"}
          emissiveIntensity={style.emissive ? 0.85 : 0}
        />
      </mesh>
      {style.atmosphere && (
        <mesh scale={1.06}>
          <sphereGeometry args={[1, 48, 48]} />
          <meshBasicMaterial
            color={style.atmosphere}
            transparent
            opacity={0.16}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

interface Props {
  targetName: string;
  ra: number;
  dec: number;
  kind?: string;
}

export default function PlanetSimulator3D({ targetName, ra, dec, kind = "" }: Props) {
  const style = useMemo(() => resolveBodyStyle(targetName, kind), [targetName, kind]);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const fn = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0.7, 3.4], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[4, 2.5, 3]} intensity={1.3} />
        <Stars radius={9} depth={2} count={700} factor={3.5} saturation={0} fade speed={reducedMotion ? 0 : 0.6} />
        <Body style={style} spin={!reducedMotion} />
        <OrbitControls makeDefault enablePan={false} enableDamping minDistance={1.7} maxDistance={7} />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2">
        <p className="truncate text-[11px] font-semibold text-starlight">
          {targetName} <span className="font-normal text-mutedstar">· {style.label}</span>
        </p>
        <p className="text-[10px] text-mutedstar/80">
          {ra.toFixed(4)}°, {dec.toFixed(4)}° · Ilustración procedural — no son datos observados.
        </p>
      </div>
    </div>
  );
}
