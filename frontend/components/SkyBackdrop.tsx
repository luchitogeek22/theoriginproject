"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import SkyMapBackdrop from "@/components/SkyMapBackdrop";
import type { ValidationTarget } from "@/lib/targets";
import { useReducedMotion } from "@/lib/useReducedMotion";

const SkyScene = dynamic(() => import("@/components/SkyScene"), { ssr: false });

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function SkyBackdrop({
  targets,
  onPrefetch,
  onLeaving,
}: {
  targets: ValidationTarget[];
  onPrefetch: (target: ValidationTarget) => void;
  onLeaving: (leaving: boolean) => void;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState<"checking" | "webgl" | "fallback">("checking");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setMode(webglAvailable() ? "webgl" : "fallback");
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (mode === "fallback") return <SkyMapBackdrop targets={targets} onPrefetch={onPrefetch} />;
  if (mode === "checking") return null;
  return (
    <div className="absolute inset-0 z-[1]" data-testid="sky-scene">
      <SkyScene
        targets={targets}
        reducedMotion={reducedMotion}
        paused={paused}
        onFlightStart={({ target }) => {
          onPrefetch(target);
          onLeaving(true);
        }}
        onArrive={({ href }) => router.push(href)}
      />
    </div>
  );
}
