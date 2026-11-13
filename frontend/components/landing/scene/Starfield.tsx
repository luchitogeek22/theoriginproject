"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { stage } from "../stage";

const vertex = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aSeed;
uniform float uTime;
uniform float uPixelRatio;
uniform float uReveal;
uniform float uTwinkle;
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = mix(1.0, 0.7 + 0.3 * sin(uTime * (0.6 + aSeed * 1.8) + aSeed * 40.0), uTwinkle);
  float reveal = smoothstep(aSeed, aSeed + 0.15, uReveal * 1.15);
  gl_PointSize = clamp(aSize * uPixelRatio * (320.0 / -mv.z), 0.0, 9.0 * uPixelRatio);
  vColor = aColor;
  vAlpha = tw * reveal;
}
`;

const fragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = pow(smoothstep(0.5, 0.0, d), 1.8);
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

const PALETTE = ["#F4F6FC", "#F4F6FC", "#F4F6FC", "#6f9be8", "#8fb3f0", "#4263FF", "#ffd9b8"].map((c) => new THREE.Color(c));

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function Starfield({ count }: { count: number }) {
  const gl = useThree((s) => s.gl);

  const { geometry, material } = useMemo(() => {
    const rand = mulberry32(7);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const u = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const r = 160 + Math.pow(rand(), 0.6) * 420;
      const s = Math.sqrt(1 - u * u);
      const galactic = Math.exp(-Math.pow(u * 3.2, 2)) * (rand() < 0.45 ? 1 : 0);
      const y = galactic ? u * 0.35 : u;
      positions.set([Math.cos(theta) * s * r, y * r, Math.sin(theta) * s * r], i * 3);
      const c = PALETTE[Math.floor(rand() * PALETTE.length)];
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = 0.8 + Math.pow(rand(), 6) * 4.2;
      seeds[i] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uReveal: { value: 0 },
        uTwinkle: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: g, material: m };
  }, [count]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useFrame(({ clock }) => {
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
    material.uniforms.uReveal.value = stage.intro;
    material.uniforms.uTwinkle.value = stage.reducedMotion ? 0 : 1;
    material.uniforms.uTime.value = clock.elapsedTime;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
