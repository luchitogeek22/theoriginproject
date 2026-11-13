"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SCAN_STRIPS } from "./CelestialGrid";
import { chapterBlend, mix, stage } from "../stage";

const UP = new THREE.Vector3(0, 1, 0);

function scanHead(scan: number, out: THREE.Vector3) {
  const s = Math.min(scan, 0.9999) * SCAN_STRIPS;
  const idx = Math.floor(s);
  const progress = s - idx;
  const lon = ((idx + 0.5) / SCAN_STRIPS) * Math.PI * 2;
  const lat = (progress - 0.5) * Math.PI;
  return out.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
}

export default function SpherexInstrument() {
  const root = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);

  const resources = useMemo(() => {
    const shell = new THREE.MeshStandardMaterial({ color: "#d5dbec", metalness: 0.75, roughness: 0.28, side: THREE.DoubleSide, transparent: true });
    const bus = new THREE.MeshStandardMaterial({ color: "#2a3350", metalness: 0.5, roughness: 0.5, transparent: true });
    const aperture = new THREE.MeshBasicMaterial({ color: "#6f9be8", transparent: true });
    const beamMat = new THREE.MeshBasicMaterial({ color: "#6f9be8", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beamGeo = new THREE.CylinderGeometry(0.9, 0.04, 1, 32, 1, true);
    beamGeo.translate(0, 0.5, 0);
    const shields = [0, 1, 2].map((i) => new THREE.CylinderGeometry(1.0 - i * 0.12, 0.42 - i * 0.04, 0.9, 40, 1, true));
    const busGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.36, 6);
    const ringGeo = new THREE.TorusGeometry(0.26, 0.025, 8, 40);
    return { shell, bus, aperture, beamMat, beamGeo, shields, busGeo, ringGeo };
  }, []);

  useEffect(
    () => () => {
      const { shields, ...rest } = resources;
      shields.forEach((g) => g.dispose());
      Object.values(rest).forEach((r) => r.dispose());
    },
    [resources]
  );

  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const { a, b, t } = chapterBlend(stage.chapter);
    const presence = mix(a.telescope, b.telescope, t);
    g.visible = presence > 0.01;
    if (!g.visible) return;
    const sphere = mix(a.sphereScale, b.sphereScale, t);
    scanHead(mix(a.scan, b.scan, t), dir);
    quat.setFromUnitVectors(UP, dir);
    g.quaternion.slerp(quat, 0.12);
    g.scale.setScalar(presence);
    resources.shell.opacity = presence;
    resources.bus.opacity = presence;
    resources.aperture.opacity = presence;
    resources.beamMat.opacity = 0.18 * presence;
    if (beam.current) beam.current.scale.set(1, sphere / Math.max(presence, 0.01), 1);
  });

  return (
    <group ref={root}>
      <mesh geometry={resources.busGeo} material={resources.bus} position={[0, -0.2, 0]} />
      {resources.shields.map((geo, i) => (
        <mesh key={i} geometry={geo} material={resources.shell} position={[0, 0.45 + i * 0.06, 0]} />
      ))}
      <mesh geometry={resources.ringGeo} material={resources.aperture} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} />
      <mesh ref={beam} geometry={resources.beamGeo} material={resources.beamMat} />
    </group>
  );
}
