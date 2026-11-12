"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { MAP_SIZE, galacticPlanePaths, meridianPaths, outlinePath, parallelPaths, project, starField } from "@/lib/skyProjection";
import { sequenceUrl } from "@/lib/sequenceParams";
import type { ValidationTarget } from "@/lib/targets";
import { useReducedMotion } from "@/lib/useReducedMotion";

interface Props {
  targets: ValidationTarget[];
  onPrefetch: (target: ValidationTarget) => void;
}

const ROLE: Record<string, string> = {
  motion: "se mueve",
  brightness: "cambia de brillo",
};

export default function SkyMapBackdrop({ targets, onPrefetch }: Props) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const geometry = useMemo(
    () => ({
      outline: outlinePath(),
      meridians: meridianPaths(),
      parallels: parallelPaths(),
      galactic: galacticPlanePaths(),
      stars: starField(),
    }),
    []
  );

  return (
    <div
      className="pointer-events-none absolute right-4 top-12 z-[5] hidden w-[50%] max-w-[760px] md:block"
      data-testid="sky-map"
    >
      <svg
        viewBox={`-10 -10 ${MAP_SIZE.width + 20} ${MAP_SIZE.height + 20}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-auto w-full"
        role="group"
        aria-label="Mapa del cielo con los cinco objetivos del desafío"
      >
        <defs>
          <radialGradient id="sky-fill" cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor="#0d1830" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#05070d" stopOpacity="0.55" />
          </radialGradient>
          <filter id="sky-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <clipPath id="sky-clip">
            <path d={geometry.outline} />
          </clipPath>
        </defs>

        <path d={geometry.outline} fill="url(#sky-fill)" stroke="#46d8ff" strokeOpacity="0.28" strokeWidth="1.2" />
        <g clipPath="url(#sky-clip)">
          {geometry.galactic.map((d, i) => (
            <path key={`g${i}`} d={d} fill="none" stroke="#7f9cff" strokeOpacity="0.16" strokeWidth="34" filter="url(#sky-glow)" />
          ))}
          {geometry.meridians.map((d, i) => (
            <path key={`m${i}`} d={d} fill="none" stroke="#46d8ff" strokeOpacity="0.09" strokeWidth="0.8" />
          ))}
          {geometry.parallels.map((d, i) => (
            <path key={`p${i}`} d={d} fill="none" stroke="#46d8ff" strokeOpacity="0.09" strokeWidth="0.8" />
          ))}
          {geometry.stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#dfe9ff" opacity={s.o}>
              {s.twinkle && !reducedMotion && (
                <animate attributeName="opacity" values={`${s.o};${s.o * 0.25};${s.o}`} dur={`${3 + (i % 5)}s`} repeatCount="indefinite" />
              )}
            </circle>
          ))}
        </g>

        {targets.map((t) => {
          const { x, y } = project(t.ra_deg, t.dec_deg);
          const flip = x > MAP_SIZE.width * 0.72;
          const labelX = flip ? x - 16 : x + 16;
          const href = sequenceUrl(t, undefined, t.mode);
          return (
            <a
              key={t.key}
              href={href}
              className="pointer-events-auto cursor-pointer outline-none focus-visible:[&>circle.focus]:opacity-100"
              aria-label={`${t.name}: ${ROLE[t.mode]}. Abrir su secuencia.`}
              data-testid={`sky-target-${t.key}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                router.push(href);
              }}
              onMouseEnter={() => onPrefetch(t)}
              onFocus={() => onPrefetch(t)}
            >
              <title>{t.hook}</title>
              <circle cx={x} cy={y} r="26" fill="transparent" />
              <circle className="focus" cx={x} cy={y} r="15" fill="none" stroke="#ffffff" strokeWidth="1.6" opacity="0" />
              <circle cx={x} cy={y} r="9" fill="#46d8ff" opacity="0.3" filter="url(#sky-glow)" />
              <circle cx={x} cy={y} r="9" fill="none" stroke="#46d8ff" strokeOpacity="0.8" strokeWidth="1.4">
                {!reducedMotion && (
                  <>
                    <animate attributeName="r" values="7;16;7" dur="3.4s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.9;0;0.9" dur="3.4s" repeatCount="indefinite" />
                  </>
                )}
              </circle>
              <circle cx={x} cy={y} r="3.6" fill={t.mode === "motion" ? "#46d8ff" : "#ffb64a"} />
              <text
                x={labelX}
                y={y + 4}
                textAnchor={flip ? "end" : "start"}
                fontSize="15"
                fontWeight="600"
                fill="#eaf2ff"
                stroke="#05070d"
                strokeWidth="4"
                paintOrder="stroke"
                style={{ paintOrder: "stroke" }}
              >
                {t.name}
              </text>
            </a>
          );
        })}
      </svg>
      <p className="pointer-events-none mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-[10px] text-mutedstar">
        <span>Los cinco objetivos en el cielo real; la banda tenue es la Vía Láctea. Pulsa uno para ver su video.</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-pulse" aria-hidden="true" /> se mueve
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#ffb64a]" aria-hidden="true" /> cambia de brillo
        </span>
      </p>
    </div>
  );
}
