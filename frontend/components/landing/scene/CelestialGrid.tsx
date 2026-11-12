"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { radecToVec3 } from "@/lib/coords";
import { TARGETS } from "../content";
import { chapterBlend, mix, stage } from "../stage";

/** Approximate J2000 positions of naked-eye stars, used only as orientation landmarks. */
const CONSTELLATIONS: Array<{ name: string; stars: Array<[number, number]>; links: Array<[number, number]> }> = [
  {
    name: "Orion",
    stars: [[88.79, 7.41], [81.28, 6.35], [83.0, -0.3], [84.05, -1.2], [85.19, -1.94], [78.63, -8.2], [86.94, -9.67]],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [2, 5], [4, 6], [5, 6]],
  },
  {
    name: "Ursa Major",
    stars: [[165.93, 61.75], [165.46, 56.38], [178.46, 53.69], [183.86, 57.03], [193.51, 55.96], [200.98, 54.93], [206.89, 49.31]],
    links: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
  },
  {
    name: "Cassiopeia",
    stars: [[2.29, 59.15], [10.13, 56.54], [14.18, 60.72], [21.45, 60.24], [28.6, 63.67]],
    links: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    name: "Crux",
    stars: [[186.65, -63.1], [191.93, -59.69], [187.79, -57.11], [183.79, -58.75]],
    links: [[0, 2], [1, 3]],
  },
];

const scanVertex = /* glsl */ `
varying vec3 vPos;
void main(){
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const scanFragment = /* glsl */ `
uniform float uScan;
uniform float uOpacity;
uniform float uStrips;
varying vec3 vPos;
const float PI = 3.14159265;
void main(){
  vec3 p = normalize(vPos);
  float lon = atan(-p.z, p.x);
  float a = fract(lon / (2.0 * PI) + 1.0);
  float lat01 = asin(clamp(p.y, -1.0, 1.0)) / PI + 0.5;
  float s = a * uStrips;
  float idx = floor(s);
  float f = fract(s);
  float progress = uScan * uStrips - idx;
  float covered = progress <= 0.0 ? 0.0 : step(lat01, clamp(progress, 0.0, 1.0));
  float edge = smoothstep(0.0, 0.08, f) * smoothstep(1.0, 0.92, f);
  vec3 hue = mix(vec3(0.259, 0.388, 1.0), vec3(0.588, 0.459, 1.0), lat01);
  hue = mix(hue, vec3(0.259, 0.851, 0.961), 0.35 + 0.35 * sin(idx * 1.7));
  float head = (progress > 0.0 && progress < 1.0) ? smoothstep(0.06, 0.0, abs(lat01 - progress)) : 0.0;
  float alpha = covered * (0.035 + 0.06 * edge) + head * 0.9;
  vec3 col = hue * covered + vec3(0.85, 1.0, 1.0) * head;
  gl_FragColor = vec4(col, alpha * uOpacity);
}
`;

export const SCAN_STRIPS = 36;

function buildGrid() {
  const pts: number[] = [];
  const equator: number[] = [];
  const push = (arr: number[], a: [number, number, number], b: [number, number, number]) => arr.push(...a, ...b);
  for (let ra = 0; ra < 360; ra += 30) {
    for (let dec = -88; dec < 88; dec += 4) {
      push(pts, radecToVec3(ra, dec, 1), radecToVec3(ra, dec + 4, 1));
    }
  }
  for (const dec of [-60, -30, 30, 60]) {
    for (let ra = 0; ra < 360; ra += 4) push(pts, radecToVec3(ra, dec, 1), radecToVec3(ra + 4, dec, 1));
  }
  for (let ra = 0; ra < 360; ra += 2) push(equator, radecToVec3(ra, 0, 1), radecToVec3(ra + 2, 0, 1));
  const grid = new THREE.BufferGeometry();
  grid.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const eq = new THREE.BufferGeometry();
  eq.setAttribute("position", new THREE.Float32BufferAttribute(equator, 3));
  return { grid, eq };
}

function buildConstellations() {
  const stars: number[] = [];
  const lines: number[] = [];
  for (const c of CONSTELLATIONS) {
    const v = c.stars.map(([ra, dec]) => radecToVec3(ra, dec, 0.985));
    v.forEach((p) => stars.push(...p));
    c.links.forEach(([i, j]) => lines.push(...v[i], ...v[j]));
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(stars, 3));
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
  return { starGeo, lineGeo };
}

function centroid(stars: Array<[number, number]>): [number, number] {
  const ra = stars.reduce((s, [r]) => s + r, 0) / stars.length;
  const dec = stars.reduce((s, [, d]) => s + d, 0) / stars.length;
  return [ra, dec + 6];
}

const RA_LABELS = [0, 6, 12, 18].map((h) => ({ text: `${h}h`, pos: radecToVec3(h * 15, 0, 1.01) }));
const DEC_LABELS = [-60, -30, 30, 60].map((d) => ({ text: `${d > 0 ? "+" : "−"}${Math.abs(d)}°`, pos: radecToVec3(90, d, 1.01) }));

export default function CelestialGrid() {
  const group = useRef<THREE.Group>(null);
  const labels = useRef<HTMLDivElement[]>([]);
  const targetEls = useRef<HTMLDivElement[]>([]);

  const resources = useMemo(() => {
    const { grid, eq } = buildGrid();
    const { starGeo, lineGeo } = buildConstellations();
    const gridMat = new THREE.LineBasicMaterial({ color: "#42D9F5", transparent: true, opacity: 0, depthWrite: false });
    const eqMat = new THREE.LineBasicMaterial({ color: "#4263FF", transparent: true, opacity: 0, depthWrite: false });
    const lineMat = new THREE.LineBasicMaterial({ color: "#9675FF", transparent: true, opacity: 0, depthWrite: false });
    const starMat = new THREE.PointsMaterial({ color: "#F4F6FC", size: 3.5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
    const scanGeo = new THREE.SphereGeometry(0.995, 96, 64);
    const scanMat = new THREE.ShaderMaterial({
      vertexShader: scanVertex,
      fragmentShader: scanFragment,
      uniforms: { uScan: { value: 0 }, uOpacity: { value: 0 }, uStrips: { value: SCAN_STRIPS } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    return { grid, eq, starGeo, lineGeo, gridMat, eqMat, lineMat, starMat, scanGeo, scanMat };
  }, []);

  useEffect(
    () => () => {
      Object.values(resources).forEach((r) => r.dispose());
    },
    [resources]
  );

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const { a, b, t, index } = chapterBlend(stage.chapter);
    const opacity = mix(a.sphereOpacity, b.sphereOpacity, t) * stage.intro;
    g.scale.setScalar(mix(a.sphereScale, b.sphereScale, t));
    g.visible = opacity > 0.005;
    resources.gridMat.opacity = opacity * 0.16;
    resources.eqMat.opacity = opacity * 0.45;
    resources.lineMat.opacity = opacity * 0.55;
    resources.starMat.opacity = opacity;
    resources.scanMat.uniforms.uOpacity.value = opacity;
    resources.scanMat.uniforms.uScan.value = mix(a.scan, b.scan, t);
    const labelOpacity = String(Math.max(0, opacity * 1.2 - 0.2));
    labels.current.forEach((el) => {
      if (el) el.style.opacity = labelOpacity;
    });
    const focus = index === 3 || index === 4 ? (index === 3 ? t : 1 - t) : 0;
    targetEls.current.forEach((el, i) => {
      if (!el) return;
      el.style.opacity = labelOpacity;
      el.dataset.active = focus > 0.5 && i === stage.target ? "true" : "false";
    });
  });

  return (
    <group ref={group}>
      <lineSegments geometry={resources.grid} material={resources.gridMat} />
      <lineSegments geometry={resources.eq} material={resources.eqMat} />
      <lineSegments geometry={resources.lineGeo} material={resources.lineMat} />
      <points geometry={resources.starGeo} material={resources.starMat} />
      <mesh geometry={resources.scanGeo} material={resources.scanMat} />
      {[...RA_LABELS, ...DEC_LABELS].map((l, i) => (
        <Html key={l.text} position={l.pos} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div ref={(el) => void (el && (labels.current[i] = el))} className="landing-sky-label font-mono">
            {l.text}
          </div>
        </Html>
      ))}
      {CONSTELLATIONS.map((c, i) => (
        <Html key={c.name} position={radecToVec3(...centroid(c.stars), 1)} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div ref={(el) => void (el && (labels.current[RA_LABELS.length + DEC_LABELS.length + i] = el))} className="landing-sky-label landing-sky-label--name">
            {c.name}
          </div>
        </Html>
      ))}
      {TARGETS.map((target, i) => (
        <Html key={target.key} position={radecToVec3(target.raDeg, target.decDeg, 0.99)} center zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
          <div ref={(el) => void (el && (targetEls.current[i] = el))} className="landing-target" style={{ ["--target" as string]: target.color }}>
            <span className="landing-target__dot" />
            <span className="landing-target__name">{target.name}</span>
          </div>
        </Html>
      ))}
    </group>
  );
}
