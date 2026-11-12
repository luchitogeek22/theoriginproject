"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { NOISE_GLSL } from "./noise";
import { chapterBlend, mix, stage } from "../stage";

const surfaceVertex = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vWorld;
void main(){
  vObj = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const surfaceFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uLight;
uniform float uOpacity;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vWorld;
${NOISE_GLSL}
void main(){
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 p = normalize(vObj) * 1.6;
  float warp = fbm(p * 1.3 + vec3(0.0, uTime * 0.012, 0.0));
  float bands = sin(p.y * 7.0 + warp * 3.2);
  float detail = fbm(p * 4.0 + warp);
  vec3 deep = vec3(0.043, 0.063, 0.125);
  vec3 signal = vec3(0.259, 0.388, 1.0);
  vec3 ion = vec3(0.259, 0.851, 0.961);
  vec3 nebula = vec3(0.588, 0.459, 1.0);
  vec3 col = mix(deep, signal * 0.62, smoothstep(-0.5, 0.7, warp));
  col = mix(col, nebula * 0.6, smoothstep(0.2, 1.0, bands) * 0.65);
  col = mix(col, ion * 0.85, smoothstep(0.3, 0.8, detail) * 0.55);
  col += vec3(0.9, 0.95, 1.0) * smoothstep(0.82, 0.98, abs(normalize(vObj).y)) * 0.25;
  float ndl = dot(n, uLight);
  float diff = max(ndl, 0.0);
  float term = smoothstep(-0.2, 0.25, ndl);
  vec3 lit = col * (0.025 + 1.25 * diff);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  lit += ion * rim * 0.45 * term;
  float spec = pow(max(dot(reflect(-uLight, n), v), 0.0), 24.0) * 0.18 * diff;
  lit += vec3(spec);
  gl_FragColor = vec4(lit, uOpacity);
}
`;

const atmosphereVertex = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vWorld;
void main(){
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const atmosphereFragment = /* glsl */ `
uniform vec3 uLight;
uniform float uOpacity;
varying vec3 vNormalW;
varying vec3 vWorld;
void main(){
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - abs(dot(n, v)), 2.4);
  float day = smoothstep(-0.35, 0.6, dot(n, uLight));
  vec3 col = mix(vec3(0.259, 0.388, 1.0), vec3(0.259, 0.851, 0.961), day);
  gl_FragColor = vec4(col * fres * (0.25 + 1.4 * day), fres * uOpacity);
}
`;

function OrbitRing({ radius, tilt, speed, moonSize, color }: { radius: number; tilt: [number, number]; speed: number; moonSize: number; color: string }) {
  const moon = useRef<THREE.Mesh>(null);
  const line = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false });
    return new THREE.Line(geometry, material);
  }, [radius, color]);

  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line]
  );

  useFrame(({ clock }) => {
    const t = stage.reducedMotion ? 1.2 : clock.elapsedTime * speed;
    moon.current?.position.set(Math.cos(t) * radius, 0, Math.sin(t) * radius);
  });

  return (
    <group rotation={[tilt[0], 0, tilt[1]]}>
      <primitive object={line} dispose={null} />
      <mesh ref={moon}>
        <sphereGeometry args={[moonSize, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

export default function Planet() {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const light = useMemo(() => new THREE.Vector3(1, 0.45, 0.65).normalize(), []);

  const surface = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: surfaceVertex,
        fragmentShader: surfaceFragment,
        uniforms: { uTime: { value: 0 }, uLight: { value: light }, uOpacity: { value: 1 } },
        transparent: true,
      }),
    [light]
  );

  const atmosphere = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: atmosphereVertex,
        fragmentShader: atmosphereFragment,
        uniforms: { uLight: { value: light }, uOpacity: { value: 1 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [light]
  );

  useEffect(
    () => () => {
      surface.dispose();
      atmosphere.dispose();
    },
    [surface, atmosphere]
  );

  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g) return;
    const { a, b, t } = chapterBlend(stage.chapter);
    const presence = mix(a.planet, b.planet, t);
    const intro = stage.intro;
    const scale = Math.max(presence, 0.0001) * (0.82 + 0.18 * intro);
    g.scale.setScalar(scale);
    g.visible = presence > 0.01;
    light.set(mix(a.light[0], b.light[0], t), mix(a.light[1], b.light[1], t), mix(a.light[2], b.light[2], t)).normalize();
    surface.uniforms.uOpacity.value = Math.min(1, presence * 1.4) * intro;
    atmosphere.uniforms.uOpacity.value = Math.min(1, presence * 1.4) * intro;
    if (!stage.reducedMotion) {
      surface.uniforms.uTime.value = clock.elapsedTime;
      if (body.current) body.current.rotation.y += dt * 0.05;
    }
    g.rotation.x = mix(g.rotation.x, 0.25 + stage.pointerY * 0.12, 0.05);
    g.rotation.z = mix(g.rotation.z, -0.18 + stage.pointerX * 0.1, 0.05);
  });

  return (
    <group ref={group}>
      <mesh ref={body} material={surface}>
        <sphereGeometry args={[2, 96, 96]} />
      </mesh>
      <mesh material={atmosphere} scale={1.13}>
        <sphereGeometry args={[2, 64, 64]} />
      </mesh>
      <OrbitRing radius={3.4} tilt={[0.08, 0.12]} speed={0.22} moonSize={0.07} color="#42D9F5" />
      <OrbitRing radius={4.6} tilt={[-0.22, -0.3]} speed={0.12} moonSize={0.11} color="#9675FF" />
      <OrbitRing radius={6.2} tilt={[0.35, 0.05]} speed={0.07} moonSize={0.05} color="#F4F6FC" />
    </group>
  );
}
