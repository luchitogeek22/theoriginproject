"use client";

/** 2D fallback (equirectangular) when WebGL is unavailable. Same data, no 3D. */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { Candidate, Observation, ReferenceStar, Target } from "@/lib/types";

interface Props {
  target: Target | null;
  observations: Observation[];
  referenceStars: ReferenceStar[];
  candidates: Candidate[];
  onSelectObservation: (o: Observation) => void;
}

const W = 720;
const H = 360;
const project = (ra: number, dec: number): [number, number] => [
  ((360 - ra) / 360) * W,
  ((90 - dec) / 180) * H,
];

export default function SkyFallback2D({ target, observations, referenceStars, candidates, onSelectObservation }: Props) {
  const t = useTranslations("skyFallback");
  const grid = useMemo(() => {
    const lines: ReactNode[] = [];
    for (let ra = 0; ra < 360; ra += 30) {
      const x = (ra / 360) * W;
      lines.push(<line key={`ra${ra}`} x1={x} y1={0} x2={x} y2={H} stroke="#1c2946" strokeWidth={1} />);
    }
    for (let dec = -60; dec <= 60; dec += 30) {
      const y = ((90 - dec) / 180) * H;
      lines.push(<line key={`d${dec}`} x1={0} y1={y} x2={W} y2={y} stroke="#1c2946" strokeWidth={1} />);
    }
    return lines;
  }, []);

  return (
    <div className="flex h-full flex-col bg-abyss p-4">
      <p className="mb-2 text-xs text-gold">{t("notice")}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full flex-1 rounded border border-line bg-deep" role="img" aria-label={t("ariaLabel")}>
        {grid}
        {referenceStars.map((s) => {
          const [x, y] = project(s.ra_deg, s.dec_deg);
          return <circle key={s.name} cx={x} cy={y} r={s.mag < 0.5 ? 2.6 : 1.6} fill="#cdd8f2" opacity={0.8} />;
        })}
        {observations.slice(0, 250).map((o, i) =>
          o.ra_deg !== null && o.dec_deg !== null ? (
            <circle
              key={`${o.obs_id}-${i}`}
              cx={project(o.ra_deg, o.dec_deg)[0]}
              cy={project(o.ra_deg, o.dec_deg)[1]}
              r={3}
              fill="none"
              stroke="#46d8ff"
              strokeWidth={1.2}
              style={{ cursor: "pointer" }}
              onClick={() => onSelectObservation(o)}
            />
          ) : null
        )}
        {candidates.slice(0, 200).map((c) => {
          const [x, y] = project(c.ra_deg, c.dec_deg);
          return <rect key={c.id} x={x - 3} y={y - 3} width={6} height={6} fill="#7ee787" />;
        })}
        {target && (
          <g>
            <circle cx={project(target.ra_deg, target.dec_deg)[0]} cy={project(target.ra_deg, target.dec_deg)[1]} r={5} fill="#c8a45c" />
            <text x={project(target.ra_deg, target.dec_deg)[0] + 8} y={project(target.ra_deg, target.dec_deg)[1]} fill="#e8eefc" fontSize={12}>
              {target.name}
            </text>
          </g>
        )}
      </svg>
      <p className="mt-2 text-[11px] text-mutedstar">{t("projection")}</p>
    </div>
  );
}
