"use client";

/** LIVING SKY — navigable celestial sphere (directions only, not distances).
 *
 * Camera sits near the sphere centre; RA/DEC map to the unit sphere through
 * lib/coords (radecToVec3). Grid, footprints, targets and candidates all
 * share that single conversion. Decorative geometry is absent by design:
 * every marker on the sphere comes from resolved or queried data, except
 * the labeled bright-star reference layer (catalog J2000).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { DEG, parsePolygonRegion, radecToVec3 } from "@/lib/coords";
import type { Candidate, Observation, ReferenceStar, Target } from "@/lib/types";

const RADIUS = 100;

export interface SkyLayers {
  grid: boolean;
  references: boolean;
  footprints: boolean;
  candidates: boolean;
  labels: boolean;
}

interface SkyProps {
  target: Target | null;
  observations: Observation[];
  referenceStars: ReferenceStar[];
  candidates: Candidate[];
  layers: SkyLayers;
  fov: number;
  focus: { ra: number; dec: number; nonce: number } | null;
  resetNonce: number;
  reducedMotion: boolean;
  onSelectObservation: (o: Observation) => void;
  onSelectCandidate: (c: Candidate) => void;
}

function makeSprite(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.85)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function Grid({ visible }: { visible: boolean }) {
  const geometry = useMemo(() => {
    const pts: number[] = [];
    const seg = (a: [number, number, number], b: [number, number, number]) => {
      pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    };
    // Meridians every 30° RA.
    for (let ra = 0; ra < 360; ra += 30) {
      for (let dec = -75; dec < 75; dec += 5) {
        seg(radecToVec3(ra, dec, RADIUS), radecToVec3(ra, dec + 5, RADIUS));
      }
    }
    // Parallels every 30° DEC.
    for (let dec = -60; dec <= 60; dec += 30) {
      for (let ra = 0; ra < 360; ra += 5) {
        seg(radecToVec3(ra, dec, RADIUS), radecToVec3(ra + 5, dec, RADIUS));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const equator = useMemo(() => {
    const pts: number[] = [];
    for (let ra = 0; ra < 360; ra += 3) {
      const a = radecToVec3(ra, 0, RADIUS);
      const b = radecToVec3(ra + 3, 0, RADIUS);
      pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useEffect(() => () => equator.dispose(), [equator]);

  const ecliptic = useMemo(() => {
    // Ecliptic: equatorial ring tilted by the obliquity (23.44°) about X.
    const eps = 23.439281 * DEG;
    const pts: number[] = [];
    let prev: [number, number, number] | null = null;
    for (let lon = 0; lon <= 360; lon += 3) {
      const l = lon * DEG;
      const p: [number, number, number] = [
        RADIUS * Math.cos(l),
        RADIUS * Math.sin(l) * Math.sin(eps),
        RADIUS * Math.sin(l) * Math.cos(eps),
      ];
      if (prev) pts.push(prev[0], prev[1], prev[2], p[0], p[1], p[2]);
      prev = p;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useEffect(() => () => ecliptic.dispose(), [ecliptic]);

  if (!visible) return null;
  return (
    <group>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#22345c" transparent opacity={0.6} />
      </lineSegments>
      <lineSegments geometry={equator}>
        <lineBasicMaterial color="#33497e" transparent opacity={0.9} />
      </lineSegments>
      <lineSegments geometry={ecliptic}>
        <lineBasicMaterial color="#5c4c22" transparent opacity={0.55} />
      </lineSegments>
    </group>
  );
}

function ReferenceStars({ stars, visible }: { stars: ReferenceStar[]; visible: boolean }) {
  const sprite = useMemo(() => (typeof document !== "undefined" ? makeSprite() : null), []);
  useEffect(() => () => sprite?.dispose(), [sprite]);
  const geometry = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (const s of stars) {
      const p = radecToVec3(s.ra_deg, s.dec_deg, RADIUS);
      pos.push(p[0], p[1], p[2]);
      // Brighter stars read warmer; all small and clearly a reference layer.
      c.set(s.mag < 0.5 ? "#ffe9c4" : "#cdd8f2");
      col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [stars]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!visible || !sprite) return null;
  return (
    <points geometry={geometry}>
      <pointsMaterial
        size={2.4}
        map={sprite}
        vertexColors
        transparent
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function Footprints({
  observations,
  visible,
  onSelect,
}: {
  observations: Observation[];
  visible: boolean;
  onSelect: (o: Observation) => void;
}) {
  const loops = useMemo(() => {
    return observations.slice(0, 250).map((o, i) => {
      const poly = parsePolygonRegion(o.s_region);
      let points: Array<[number, number, number]>;
      if (poly) {
        points = poly.map(([ra, dec]) => radecToVec3(ra, dec, RADIUS - 0.4));
      } else if (o.ra_deg !== null && o.dec_deg !== null) {
        // Fallback: small diamond at the field centre (not a measured footprint).
        const c = o.fov_deg ?? 0.5;
        const d = Math.max(c / 2, 0.15);
        points = [
          radecToVec3(o.ra_deg, (o.dec_deg ?? 0) + d, RADIUS - 0.4),
          radecToVec3(o.ra_deg + d, o.dec_deg ?? 0, RADIUS - 0.4),
          radecToVec3(o.ra_deg, (o.dec_deg ?? 0) - d, RADIUS - 0.4),
          radecToVec3(o.ra_deg - d, o.dec_deg ?? 0, RADIUS - 0.4),
        ];
      } else {
        return null;
      }
      const g = new THREE.BufferGeometry().setFromPoints(
        points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
      );
      return { key: `${o.collection}-${o.obs_id}-${i}`, geometry: g, obs: o };
    });
  }, [observations]);

  useEffect(() => () => loops.forEach((l) => l?.geometry.dispose()), [loops]);
  if (!visible) return null;
  return (
    <group>
      {loops.map(
        (l) =>
          l && (
            <lineLoop
              key={l.key}
              geometry={l.geometry}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(l.obs);
              }}
            >
              <lineBasicMaterial color="#46d8ff" transparent opacity={0.75} />
            </lineLoop>
          )
      )}
    </group>
  );
}

function TargetMarker({ target, showLabel }: { target: Target; showLabel: boolean }) {
  const pos = useMemo(
    () => radecToVec3(target.ra_deg, target.dec_deg, RADIUS - 1),
    [target.ra_deg, target.dec_deg]
  );
  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[1.1, 20, 20]} />
        <meshBasicMaterial color="#c8a45c" />
      </mesh>
      <mesh>
        <ringGeometry args={[1.9, 2.2, 40]} />
        <meshBasicMaterial color="#c8a45c" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      {showLabel && (
        <Html center distanceFactor={220} zIndexRange={[20, 0]}>
          <div className="whitespace-nowrap rounded border border-line bg-abyss/90 px-2 py-1 text-[11px] text-starlight">
            {target.name}
            <span className="ml-1 text-mutedstar">
              {target.ra_deg.toFixed(3)}°, {target.dec_deg.toFixed(3)}°
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

function CandidateMarkers({
  candidates,
  visible,
  onSelect,
}: {
  candidates: Candidate[];
  visible: boolean;
  onSelect: (c: Candidate) => void;
}) {
  const items = useMemo(
    () =>
      candidates.slice(0, 200).map((c) => ({
        c,
        pos: radecToVec3(c.ra_deg, c.dec_deg, RADIUS - 1.2),
      })),
    [candidates]
  );
  if (!visible) return null;
  return (
    <group>
      {items.map(({ c, pos }) => (
        <mesh
          key={c.id}
          position={pos}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(c);
          }}
        >
          <octahedronGeometry args={[1.0]} />
          <meshBasicMaterial color="#7ee787" />
        </mesh>
      ))}
    </group>
  );
}

function CameraRig({
  focus,
  resetNonce,
  reducedMotion,
  fov,
}: Pick<SkyProps, "focus" | "resetNonce" | "reducedMotion" | "fov">) {
  const { camera, invalidate } = useThree();
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const goal = useRef<THREE.Vector3 | null>(null);
  const lastNonce = useRef<number | null>(null);
  const lastReset = useRef(resetNonce);
  const perspective = camera as THREE.PerspectiveCamera;

  useEffect(() => {
    perspective.fov = fov;
    perspective.updateProjectionMatrix();
    invalidate();
  }, [fov, perspective, invalidate]);

  useEffect(() => {
    if (focus && focus.nonce !== lastNonce.current) {
      lastNonce.current = focus.nonce;
      const [x, y, z] = radecToVec3(focus.ra, focus.dec, 1);
      const dir = new THREE.Vector3(x, y, z);
      const dist = Math.max(camera.position.length(), 8);
      // The camera sits inside the sphere, so it must be opposite the target to look at it.
      goal.current = dir.multiplyScalar(-dist);
      if (reducedMotion) {
        camera.position.copy(goal.current);
        camera.lookAt(0, 0, 0);
        controls?.update();
        goal.current = null;
      }
      invalidate();
    }
  }, [focus, reducedMotion, camera, controls, invalidate]);

  useEffect(() => {
    if (resetNonce !== lastReset.current) {
      lastReset.current = resetNonce;
      camera.position.set(0, 12, 42);
      camera.lookAt(0, 0, 0);
      controls?.update();
      goal.current = null;
      invalidate();
    }
  }, [resetNonce, camera, controls, invalidate]);

  useFrame(() => {
    if (!goal.current) return;
    camera.position.lerp(goal.current, 0.09);
    camera.lookAt(0, 0, 0);
    if (camera.position.distanceTo(goal.current) < 0.15) goal.current = null;
    else invalidate();
  });
  return null;
}

function Scene(props: SkyProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const invalidate = useThree((s) => s.invalidate);
  const rotating = autoRotate && !props.reducedMotion;

  useEffect(() => {
    if (props.reducedMotion) setAutoRotate(false);
  }, [props.reducedMotion]);

  useFrame(() => {
    if (rotating) invalidate();
  });

  return (
    <>
      <color attach="background" args={["#04070f"]} />
      <CameraRig
        focus={props.focus}
        resetNonce={props.resetNonce}
        reducedMotion={props.reducedMotion}
        fov={props.fov}
      />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, 0, 0]}
        enablePan={false}
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.55}
        minDistance={6}
        maxDistance={92}
        autoRotate={rotating}
        autoRotateSpeed={0.4}
      />
      <Grid visible={props.layers.grid} />
      <ReferenceStars stars={props.referenceStars} visible={props.layers.references} />
      <Footprints
        observations={props.observations}
        visible={props.layers.footprints}
        onSelect={props.onSelectObservation}
      />
      <CandidateMarkers
        candidates={props.candidates}
        visible={props.layers.candidates}
        onSelect={props.onSelectCandidate}
      />
      {props.target && <TargetMarker target={props.target} showLabel={props.layers.labels} />}
      {!props.reducedMotion && (
        <Html position={[0, -28, 0]} center zIndexRange={[10, 0]}>
          <button
            onClick={() => setAutoRotate((v) => !v)}
            className="rounded border border-line bg-abyss/80 px-2 py-1 text-[11px] text-mutedstar hover:text-starlight"
          >
            {autoRotate ? "Detener deriva" : "Deriva lenta"}
          </button>
        </Html>
      )}
    </>
  );
}

class SkyErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function CelestialSphere(props: SkyProps & { fallback: React.ReactNode }) {
  const [glFailed, setGlFailed] = useState(false);
  if (glFailed) return <>{props.fallback}</>;
  return (
    <SkyErrorBoundary fallback={props.fallback}>
      <Canvas
        dpr={[1, 2]}
        frameloop="demand"
        aria-label="Esfera celeste interactiva: arrastra para girar y usa la rueda para acercar"
        role="group"
        camera={{ fov: props.fov, near: 0.1, far: 2000, position: [0, 12, 42] }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          if (!gl.getContext()) setGlFailed(true);
        }}
      >
        <Scene {...props} />
      </Canvas>
    </SkyErrorBoundary>
  );
}
