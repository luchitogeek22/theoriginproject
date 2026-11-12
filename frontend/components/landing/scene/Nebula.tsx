"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { stage } from "../stage";

function cloudTexture(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const lattice = Array.from({ length: 64 * 64 }, () => Math.random());
  const value = (x: number, y: number) => {
    const xi = Math.floor(x) & 63;
    const yi = Math.floor(y) & 63;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const s = (t: number) => t * t * (3 - 2 * t);
    const v = (i: number, j: number) => lattice[((yi + j) & 63) * 64 + ((xi + i) & 63)];
    const top = v(0, 0) + (v(1, 0) - v(0, 0)) * s(xf);
    const bottom = v(0, 1) + (v(1, 1) - v(0, 1)) * s(xf);
    return top + (bottom - top) * s(yf);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      let amp = 0.55;
      let freq = 4 / size;
      for (let o = 0; o < 5; o++) {
        n += amp * value(x * freq, y * freq);
        amp *= 0.5;
        freq *= 2;
      }
      const dx = x / size - 0.5;
      const dy = y / size - 0.5;
      const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.pow(Math.max(0, n - 0.35) * 1.8, 1.6) * falloff * falloff;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const CLOUDS: Array<{ pos: [number, number, number]; scale: number; color: string; opacity: number }> = [
  { pos: [-220, 80, -380], scale: 520, color: "#9675FF", opacity: 0.16 },
  { pos: [260, -60, -320], scale: 420, color: "#4263FF", opacity: 0.18 },
  { pos: [40, 160, 340], scale: 480, color: "#42D9F5", opacity: 0.08 },
  { pos: [-320, -140, 220], scale: 400, color: "#9675FF", opacity: 0.1 },
];

export default function Nebula({ resolution }: { resolution: number }) {
  const texture = useMemo(() => cloudTexture(resolution), [resolution]);
  const materials = useMemo(
    () =>
      CLOUDS.map(
        (c) =>
          new THREE.SpriteMaterial({
            map: texture,
            color: c.color,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
      ),
    [texture]
  );

  useEffect(
    () => () => {
      texture.dispose();
      materials.forEach((m) => m.dispose());
    },
    [texture, materials]
  );

  useFrame(() => {
    materials.forEach((m, i) => {
      m.opacity = CLOUDS[i].opacity * stage.intro;
    });
  });

  return (
    <group>
      {CLOUDS.map((c, i) => (
        <sprite key={i} position={c.pos} scale={c.scale} material={materials[i]} />
      ))}
    </group>
  );
}
