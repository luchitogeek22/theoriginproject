"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { radecToVec3 } from "@/lib/coords";
import { galacticToEquatorial, seededRandom } from "@/lib/skyProjection";
import { sequenceUrl } from "@/lib/sequenceParams";
import type { ValidationTarget } from "@/lib/targets";

const RADIUS = 100;
const FORWARD = new THREE.Vector3(0, 0, -1);
const ROLE = { motion: "se mueve", brightness: "cambia de brillo" } as const;
const COLORS = { motion: "#46d8ff", brightness: "#ffb64a" } as const;

function glowTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildStars(seed: number, count: number, palette: THREE.Color[]) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const z = 2 * random() - 1;
    const phi = 2 * Math.PI * random();
    const r = Math.sqrt(1 - z * z);
    const radius = RADIUS * (0.92 + random() * 0.08);
    positions.set([radius * r * Math.cos(phi), radius * z, -radius * r * Math.sin(phi)], i * 3);
    const color = palette[Math.floor(random() * palette.length)];
    const brightness = 0.45 + random() * 0.55;
    colors.set([color.r * brightness, color.g * brightness, color.b * brightness], i * 3);
  }
  return { positions, colors };
}

function buildMilkyWay(count: number, spread: number, seed: number) {
  const random = seededRandom(seed);
  const gaussian = () => random() + random() + random() - 1.5;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cool = new THREE.Color("#8ea6ff");
  const warm = new THREE.Color("#ffd9a0");
  for (let i = 0; i < count; i++) {
    const centre = random() < 0.5;
    const l = centre ? (gaussian() * 90 + 360) % 360 : random() * 360;
    const nearCore = Math.max(0, Math.cos((l * Math.PI) / 180));
    const b = gaussian() * spread * (1 + 0.9 * nearCore);
    const { ra, dec } = galacticToEquatorial(l, b);
    const [x, y, z] = radecToVec3(ra, dec, RADIUS * (0.9 + random() * 0.08));
    positions.set([x, y, z], i * 3);
    const mix = Math.min(1, nearCore * (0.5 + random() * 0.7));
    const color = cool.clone().lerp(warm, mix);
    const brightness = 0.35 + random() * 0.65;
    colors.set([color.r * brightness, color.g * brightness, color.b * brightness], i * 3);
  }
  return { positions, colors };
}

function PointCloud({
  data,
  size,
  opacity,
  map,
  twinkle,
}: {
  data: { positions: Float32Array; colors: Float32Array };
  size: number;
  opacity: number;
  map: THREE.Texture;
  twinkle?: number;
}) {
  const material = useRef<THREE.PointsMaterial>(null);
  useFrame(({ clock }) => {
    if (twinkle && material.current) {
      material.current.opacity = opacity * (1 - twinkle + twinkle * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.3 + size)));
    }
  });
  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={data.positions} count={data.positions.length / 3} itemSize={3} />
        <bufferAttribute attach="attributes-color" array={data.colors} count={data.colors.length / 3} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        ref={material}
        map={map}
        size={size}
        sizeAttenuation={false}
        vertexColors
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

interface FlightRequest {
  target: ValidationTarget;
  href: string;
}

function TargetMarker({
  target,
  texture,
  reducedMotion,
  onActivate,
}: {
  target: ValidationTarget;
  texture: THREE.Texture;
  reducedMotion: boolean;
  onActivate: (request: FlightRequest) => void;
}) {
  const position = useMemo(() => new THREE.Vector3(...radecToVec3(target.ra_deg, target.dec_deg, RADIUS * 0.97)), [target]);
  const glow = useRef<THREE.Sprite>(null);
  const label = useRef<HTMLDivElement>(null);
  const world = useMemo(() => new THREE.Vector3(), []);
  const color = COLORS[target.mode];
  const href = sequenceUrl(target, undefined, target.mode);
  const phase = useMemo(() => target.ra_deg * 0.05, [target]);

  useFrame(({ clock }) => {
    if (glow.current) {
      const pulse = reducedMotion ? 1 : 1 + 0.28 * Math.sin(clock.elapsedTime * 2.1 + phase);
      glow.current.scale.setScalar(7.5 * pulse);
    }
    if (label.current && glow.current) {
      glow.current.getWorldPosition(world);
      const facing = world.normalize().dot(FORWARD);
      const visible = facing > 0.2;
      label.current.style.opacity = visible ? "1" : "0";
      label.current.style.pointerEvents = visible ? "auto" : "none";
    }
  });

  const activate = () => onActivate({ target, href });
  return (
    <group position={position}>
      <sprite
        ref={glow}
        scale={7.5}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (e.delta < 6) activate();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <spriteMaterial map={texture} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh>
        <sphereGeometry args={[0.42, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <Html position={[0, -3.4, 0]} center zIndexRange={[6, 0]}>
        <div ref={label} style={{ transition: "opacity 0.3s" }}>
          <a
            href={href}
            data-testid={`sky-target-${target.key}`}
            aria-label={`${target.name}: ${ROLE[target.mode]}. Abrir su secuencia.`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) return;
              e.preventDefault();
              activate();
            }}
            className="group flex flex-col items-center whitespace-nowrap rounded-full border border-white/10 bg-abyss/70 px-3 py-1 text-center backdrop-blur-sm transition hover:border-pulse hover:bg-abyss/90 focus-visible:border-pulse focus-visible:outline-none"
          >
            <span className="text-[13px] font-semibold text-starlight">{target.name}</span>
            <span className="text-[10px]" style={{ color }}>
              {ROLE[target.mode]}
            </span>
          </a>
        </div>
      </Html>
    </group>
  );
}

function Scene({
  targets,
  reducedMotion,
  onFlightStart,
  onArrive,
}: {
  targets: ValidationTarget[];
  reducedMotion: boolean;
  onFlightStart: (request: FlightRequest) => void;
  onArrive: (request: FlightRequest) => void;
}) {
  const { camera, gl, pointer } = useThree();
  const perspective = camera as THREE.PerspectiveCamera;
  const world = useRef<THREE.Group>(null);
  const glow = useMemo(glowTexture, []);
  const stars = useMemo(() => {
    const palette = ["#ffffff", "#cfe0ff", "#ffe9c9", "#a9c4ff"].map((c) => new THREE.Color(c));
    return {
      faint: buildStars(11, 5200, palette),
      mid: buildStars(23, 900, palette),
      bright: buildStars(37, 90, palette),
      band: buildMilkyWay(9000, 6.5, 41),
      haze: buildMilkyWay(420, 9, 53),
    };
  }, []);
  const drag = useRef({ active: false, x: 0, y: 0, vx: 0, vy: 0, moved: 0 });
  const flight = useRef<{ from: THREE.Quaternion; to: THREE.Quaternion; start: number; fov: number; request: FlightRequest } | null>(null);
  const temp = useMemo(() => ({ q: new THREE.Quaternion(), axisY: new THREE.Vector3(0, 1, 0), axisX: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3() }), []);

  useEffect(() => {
    const barnard = targets.find((t) => t.key === "barnard") ?? targets[0];
    if (!barnard || !world.current) return;
    const direction = new THREE.Vector3(...radecToVec3(barnard.ra_deg, barnard.dec_deg, 1));
    world.current.quaternion.setFromUnitVectors(direction, FORWARD);
    temp.q.setFromAxisAngle(temp.axisY, -0.55);
    world.current.quaternion.premultiply(temp.q);
    temp.q.setFromAxisAngle(temp.axisX, 0.12);
    world.current.quaternion.premultiply(temp.q);
  }, [targets, temp]);

  useEffect(() => {
    const element = gl.domElement;
    element.style.touchAction = "pan-y";
    const down = (e: PointerEvent) => {
      drag.current = { active: true, x: e.clientX, y: e.clientY, vx: 0, vy: 0, moved: 0 };
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.active || flight.current) return;
      const dx = e.clientX - d.x;
      const dy = e.pointerType === "mouse" ? e.clientY - d.y : 0;
      d.x = e.clientX;
      d.y = e.clientY;
      d.vx = dx * 0.0042;
      d.vy = dy * 0.0036;
      d.moved += Math.abs(dx) + Math.abs(dy);
      if (world.current) {
        temp.q.setFromAxisAngle(temp.axisY, d.vx);
        world.current.quaternion.premultiply(temp.q);
        temp.q.setFromAxisAngle(temp.axisX, d.vy);
        world.current.quaternion.premultiply(temp.q);
      }
    };
    const up = () => {
      drag.current.active = false;
    };
    element.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      element.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [gl, temp]);

  const startFlight = (request: FlightRequest) => {
    if (flight.current) return;
    onFlightStart(request);
    if (reducedMotion || !world.current) {
      onArrive(request);
      return;
    }
    const direction = new THREE.Vector3(...radecToVec3(request.target.ra_deg, request.target.dec_deg, 1)).applyQuaternion(world.current.quaternion);
    const turn = new THREE.Quaternion().setFromUnitVectors(direction.normalize(), FORWARD);
    flight.current = {
      from: world.current.quaternion.clone(),
      to: turn.multiply(world.current.quaternion.clone()),
      start: performance.now(),
      fov: perspective.fov,
      request,
    };
  };

  useFrame((_, delta) => {
    const group = world.current;
    if (!group) return;
    const f = flight.current;
    if (f) {
      const p = Math.min(1, (performance.now() - f.start) / 1250);
      const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      group.quaternion.slerpQuaternions(f.from, f.to, eased);
      perspective.fov = f.fov + (26 - f.fov) * eased * eased;
      perspective.updateProjectionMatrix();
      if (p >= 1) {
        flight.current = null;
        onArrive(f.request);
      }
      return;
    }
    const d = drag.current;
    if (!d.active) {
      d.vx *= 0.94;
      d.vy *= 0.94;
      if (Math.abs(d.vx) + Math.abs(d.vy) > 0.00005) {
        temp.q.setFromAxisAngle(temp.axisY, d.vx);
        group.quaternion.premultiply(temp.q);
        temp.q.setFromAxisAngle(temp.axisX, d.vy);
        group.quaternion.premultiply(temp.q);
      } else if (!reducedMotion) {
        temp.q.setFromAxisAngle(temp.axisY, -delta * 0.018);
        group.quaternion.premultiply(temp.q);
      }
    }
    if (!reducedMotion) {
      perspective.rotation.y += (-pointer.x * 0.06 - perspective.rotation.y) * 0.04;
      perspective.rotation.x += (pointer.y * 0.04 - perspective.rotation.x) * 0.04;
    }
  });

  return (
    <>
      <group ref={world}>
        <PointCloud data={stars.faint} size={2.4} opacity={1} map={glow} />
        <PointCloud data={stars.mid} size={4.2} opacity={1} map={glow} twinkle={0.35} />
        <PointCloud data={stars.bright} size={9} opacity={1} map={glow} twinkle={0.25} />
        <PointCloud data={stars.band} size={4.5} opacity={0.6} map={glow} />
        <PointCloud data={stars.haze} size={70} opacity={0.12} map={glow} />
        {targets.map((t) => (
          <TargetMarker key={t.key} target={t} texture={glow} reducedMotion={reducedMotion} onActivate={startFlight} />
        ))}
      </group>
    </>
  );
}

export default function SkyScene({
  targets,
  reducedMotion,
  paused,
  onFlightStart,
  onArrive,
}: {
  targets: ValidationTarget[];
  reducedMotion: boolean;
  paused: boolean;
  onFlightStart: (request: FlightRequest) => void;
  onArrive: (request: FlightRequest) => void;
}) {
  return (
    <Canvas
      frameloop={paused ? "never" : "always"}
      dpr={[1, 1.6]}
      camera={{ fov: 68, near: 0.1, far: 400, position: [0, 0, 0.01] }}
      gl={{ antialias: false, powerPreference: "high-performance", alpha: true }}
      aria-hidden="true"
    >
      <Scene targets={targets} reducedMotion={reducedMotion} onFlightStart={onFlightStart} onArrive={onArrive} />
    </Canvas>
  );
}
