"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { chapterBlend, damp, mix, stage } from "../stage";
import { SIM_MOVER_SHIFT_PX, simulatedBrightness as brightness } from "../simulation";

/** Illustrative field only: a simulated patch with one moving source and one variable source. */

const WIDTH = 16;
const HEIGHT = 10;
const PIXEL = 0.5;
const MOVER_START = new THREE.Vector2(-2.2, 0.9);
const VARIABLE_POS = new THREE.Vector2(3.1, -1.6);

const vertex = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
uniform float uPixelRatio;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio * (18.0 / -mv.z);
  vColor = aColor;
  vAlpha = aAlpha * uOpacity;
}
`;

const fragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor, pow(core, 1.6) * vAlpha);
}
`;

function makePoints(count: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(count), 1));
  g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(count), 1));
  return g;
}

function makeMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: { uPixelRatio: { value: 1 }, uOpacity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

const WHITE = new THREE.Color("#F4F6FC");
const ION = new THREE.Color("#42D9F5");
const NEBULA = new THREE.Color("#9675FF");

export default function EpochField() {
  const root = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const epoch = useRef(0);
  const diff = useRef(0);

  const resources = useMemo(() => {
    let seed = 11;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const fieldGeo = makePoints(170);
    const pos = fieldGeo.getAttribute("position") as THREE.BufferAttribute;
    const col = fieldGeo.getAttribute("aColor") as THREE.BufferAttribute;
    const size = fieldGeo.getAttribute("aSize") as THREE.BufferAttribute;
    const alpha = fieldGeo.getAttribute("aAlpha") as THREE.BufferAttribute;
    for (let i = 0; i < 170; i++) {
      pos.setXYZ(i, (rand() - 0.5) * WIDTH * 0.95, (rand() - 0.5) * HEIGHT * 0.92, 0.02);
      const c = rand() < 0.15 ? ION : WHITE;
      col.setXYZ(i, c.r, c.g, c.b);
      size.setX(i, 6 + Math.pow(rand(), 5) * 34);
      alpha.setX(i, 0.35 + rand() * 0.65);
    }
    const specialGeo = makePoints(3);
    const fieldMat = makeMaterial();
    const specialMat = makeMaterial();

    const gridPts: number[] = [];
    for (let x = -WIDTH / 2; x <= WIDTH / 2 + 1e-6; x += PIXEL) gridPts.push(x, -HEIGHT / 2, 0, x, HEIGHT / 2, 0);
    for (let y = -HEIGHT / 2; y <= HEIGHT / 2 + 1e-6; y += PIXEL) gridPts.push(-WIDTH / 2, y, 0, WIDTH / 2, y, 0);
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3));
    const gridMat = new THREE.LineBasicMaterial({ color: "#4263FF", transparent: true, opacity: 0, depthWrite: false });

    const backGeo = new THREE.PlaneGeometry(WIDTH, HEIGHT);
    const frameGeo = new THREE.EdgesGeometry(backGeo);
    const frameMat = new THREE.LineBasicMaterial({ color: "#42D9F5", transparent: true, opacity: 0 });
    const backMat = new THREE.MeshBasicMaterial({ color: "#0B1020", transparent: true, opacity: 0, depthWrite: false });

    const ringGeo = new THREE.RingGeometry(0.62, 0.66, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#42D9F5", transparent: true, opacity: 0, depthWrite: false });
    return { fieldGeo, specialGeo, fieldMat, specialMat, gridGeo, gridMat, frameGeo, frameMat, backGeo, backMat, ringGeo, ringMat };
  }, []);

  useEffect(
    () => () => {
      Object.values(resources).forEach((r) => r.dispose());
    },
    [resources]
  );

  const moverRing = useRef<THREE.Mesh>(null);
  const variableRing = useRef<THREE.Mesh>(null);

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    const { a, b, t } = chapterBlend(stage.chapter);
    const presence = mix(a.epochPanel, b.epochPanel, t);
    g.visible = presence > 0.01;
    if (!g.visible) return;
    g.position.x = damp(g.position.x, stage.compact ? 0 : 4.2, 4, dt);
    g.position.y = stage.compact ? -5.5 : 0;

    const instant = stage.reducedMotion;
    epoch.current = instant ? stage.epoch : damp(epoch.current, stage.epoch, 6, dt);
    diff.current = instant ? stage.difference : damp(diff.current, stage.difference, 6, dt);
    const e = epoch.current;
    const d = diff.current;
    const pr = gl.getPixelRatio();

    resources.fieldMat.uniforms.uPixelRatio.value = pr;
    resources.specialMat.uniforms.uPixelRatio.value = pr;
    resources.fieldMat.uniforms.uOpacity.value = presence * (1 - 0.9 * d);
    resources.specialMat.uniforms.uOpacity.value = presence;
    resources.gridMat.opacity = presence * 0.12;
    resources.frameMat.opacity = presence * 0.6;
    resources.backMat.opacity = presence * 0.55;
    resources.ringMat.opacity = presence * d * 0.9;

    const shift = SIM_MOVER_SHIFT_PX * PIXEL * e;
    const pos = resources.specialGeo.getAttribute("position") as THREE.BufferAttribute;
    const col = resources.specialGeo.getAttribute("aColor") as THREE.BufferAttribute;
    const size = resources.specialGeo.getAttribute("aSize") as THREE.BufferAttribute;
    const alpha = resources.specialGeo.getAttribute("aAlpha") as THREE.BufferAttribute;

    const moverColor = WHITE.clone().lerp(ION, d);
    pos.setXYZ(0, MOVER_START.x + shift, MOVER_START.y, 0.04);
    col.setXYZ(0, moverColor.r, moverColor.g, moverColor.b);
    size.setX(0, 30);
    alpha.setX(0, 1);

    pos.setXYZ(1, MOVER_START.x, MOVER_START.y, 0.03);
    col.setXYZ(1, NEBULA.r, NEBULA.g, NEBULA.b);
    size.setX(1, 30);
    alpha.setX(1, d * Math.min(1, e * 4));

    const level = brightness(e);
    const change = level - brightness(0);
    const variableColor = WHITE.clone().lerp(ION, d);
    pos.setXYZ(2, VARIABLE_POS.x, VARIABLE_POS.y, 0.04);
    col.setXYZ(2, variableColor.r, variableColor.g, variableColor.b);
    size.setX(2, mix(16 + level * 30, 14 + change * 70, d));
    alpha.setX(2, mix(level, Math.min(1, change * 2.2), d));

    pos.needsUpdate = col.needsUpdate = size.needsUpdate = alpha.needsUpdate = true;
    moverRing.current?.position.set(MOVER_START.x + shift / 2, MOVER_START.y, 0.05);
    variableRing.current?.position.set(VARIABLE_POS.x, VARIABLE_POS.y, 0.05);
  });

  return (
    <group ref={root} position={[4.2, 0, -60]}>
      <mesh geometry={resources.backGeo} material={resources.backMat} />
      <lineSegments geometry={resources.gridGeo} material={resources.gridMat} />
      <lineSegments geometry={resources.frameGeo} material={resources.frameMat} />
      <points geometry={resources.fieldGeo} material={resources.fieldMat} frustumCulled={false} />
      <points geometry={resources.specialGeo} material={resources.specialMat} frustumCulled={false} />
      <mesh ref={moverRing} geometry={resources.ringGeo} material={resources.ringMat} scale={[1.6, 1, 1]} />
      <mesh ref={variableRing} geometry={resources.ringGeo} material={resources.ringMat} />
    </group>
  );
}
