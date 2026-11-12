"use client";

import { Canvas } from "@react-three/fiber";
import Director from "./Director";
import Planet from "./Planet";
import Starfield from "./Starfield";
import Nebula from "./Nebula";
import CelestialGrid from "./CelestialGrid";
import SpherexInstrument from "./SpherexInstrument";
import EpochField from "./EpochField";

export default function Experience({ compact }: { compact: boolean }) {
  return (
    <Canvas
      dpr={compact ? [1, 1.5] : [1, 2]}
      camera={{ fov: compact ? 60 : 50, near: 0.1, far: 2000, position: [0, 0.35, 12] }}
      gl={{ antialias: !compact, powerPreference: "high-performance", alpha: false }}
      aria-hidden
    >
      <color attach="background" args={["#05060A"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 4, 5]} intensity={1.6} color="#e9efff" />
      <directionalLight position={[-6, -2, -4]} intensity={0.4} color="#9675FF" />
      <Director />
      <Starfield count={compact ? 2600 : 7000} />
      <Nebula resolution={compact ? 128 : 256} />
      <Planet />
      <CelestialGrid />
      <SpherexInstrument />
      <EpochField />
    </Canvas>
  );
}
