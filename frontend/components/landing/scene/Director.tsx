"use client";

import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { radecToVec3 } from "@/lib/coords";
import { TARGETS } from "../content";
import { chapterBlend, Keyframe, stage } from "../stage";

const INTRO_SECONDS = 2.8;

export default function Director() {
  const camera = useThree((s) => s.camera);
  const scratch = useMemo(
    () => ({
      posA: new THREE.Vector3(),
      posB: new THREE.Vector3(),
      lookA: new THREE.Vector3(),
      lookB: new THREE.Vector3(),
      goalPos: new THREE.Vector3(),
      goalLook: new THREE.Vector3(),
      look: new THREE.Vector3(0, 0, 0),
      offset: new THREE.Vector3(),
      started: -1,
      ready: false,
    }),
    []
  );

  const resolveLook = (k: Keyframe, out: THREE.Vector3) => {
    if (k.look === "target") {
      const t = TARGETS[stage.target];
      return out.set(...radecToVec3(t.raDeg, t.decDeg, 60));
    }
    return out.set(...k.look);
  };

  useFrame(({ clock }, delta) => {
    const s = scratch;
    if (s.started < 0) s.started = clock.elapsedTime;
    stage.intro = stage.reducedMotion ? 1 : Math.min(1, (clock.elapsedTime - s.started) / INTRO_SECONDS);

    const { a, b, t } = chapterBlend(stage.chapter);
    s.posA.set(...a.cam);
    s.posB.set(...b.cam);
    s.goalPos.lerpVectors(s.posA, s.posB, t);
    resolveLook(a, s.lookA);
    resolveLook(b, s.lookB);
    s.goalLook.lerpVectors(s.lookA, s.lookB, t);

    if (stage.compact) s.goalPos.sub(s.goalLook).multiplyScalar(1.35).add(s.goalLook);

    const introPull = 1 - easeOutCubic(stage.intro);
    s.goalPos.z += introPull * 5;

    const parallax = stage.reducedMotion ? 0 : 1;
    s.offset.set(stage.pointerX * 0.45 * parallax, stage.pointerY * 0.3 * parallax, 0).applyQuaternion(camera.quaternion);
    s.goalPos.add(s.offset);

    const dt = Math.min(delta, 0.05);
    const k = !s.ready || stage.reducedMotion ? 1 : 1 - Math.exp(-dt * 3.2);
    camera.position.lerp(s.goalPos, k);
    s.look.lerp(s.goalLook, !s.ready || stage.reducedMotion ? 1 : 1 - Math.exp(-dt * 3.6));
    camera.lookAt(s.look);
    s.ready = true;
  });

  return null;
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
