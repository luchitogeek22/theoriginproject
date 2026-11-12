"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import type { PipelineVisualKind } from "../content";

const ION = "#42D9F5";
const SIGNAL = "#4263FF";
const NEBULA = "#9675FF";
const STELLAR = "#F4F6FC";

/** Coordinates and archive names drawn in the diagrams: identical in every language. */
const DEMO_RA = "RA 08h 55m 10.8s";
const DEMO_DEC = "Dec −07° 14′ 42.5″";
const ARCHIVE = "NASA/IPAC IRSA · SPHEREx";

const STARS = Array.from({ length: 46 }, (_, i) => ({
  x: 20 + ((i * 97) % 360),
  y: 16 + ((i * 53) % 188),
  r: i % 7 === 0 ? 2.2 : 1.1,
}));

function Region() {
  return (
    <>
      {STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={STELLAR} opacity={0.6} />
      ))}
      <motion.g initial={{ x: -60, y: 30 }} animate={{ x: 0, y: 0 }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}>
        <circle cx={210} cy={110} r={34} fill="none" stroke={ION} strokeWidth={1.5} />
        <line x1={210} y1={66} x2={210} y2={86} stroke={ION} />
        <line x1={210} y1={134} x2={210} y2={154} stroke={ION} />
        <line x1={166} y1={110} x2={186} y2={110} stroke={ION} />
        <line x1={234} y1={110} x2={254} y2={110} stroke={ION} />
        <text x={252} y={66} fill={ION} fontSize={10} fontFamily="var(--font-mono)">{DEMO_RA}</text>
        <text x={252} y={80} fill={ION} fontSize={10} fontFamily="var(--font-mono)">{DEMO_DEC}</text>
      </motion.g>
    </>
  );
}

function Query() {
  const t = useTranslations("landing.pipeline.visual");
  return (
    <>
      <text x={20} y={30} fill={STELLAR} opacity={0.6} fontSize={10} fontFamily="var(--font-mono)">{ARCHIVE}</text>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.g key={i} initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15, duration: 0.5 }}>
          <rect x={60 + i * 26} y={60 + i * 16} width={150} height={100} rx={2} fill="#0B1020" stroke={i === 4 ? ION : SIGNAL} opacity={0.4 + i * 0.15} />
          {i === 4 && <text x={70 + i * 26} y={80 + i * 16} fill={ION} fontSize={10} fontFamily="var(--font-mono)">{t("exposure")}</text>}
        </motion.g>
      ))}
    </>
  );
}

function Fits() {
  const t = useTranslations("landing.pipeline.visual");
  return (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <motion.path
          key={i}
          d={`M ${110 + i * 12} ${150 - i * 14} l 120 0 l 50 -40 l -120 0 z`}
          fill={i % 2 ? SIGNAL : NEBULA}
          fillOpacity={0.12}
          stroke={i === 5 ? ION : SIGNAL}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.12, duration: 0.5 }}
        />
      ))}
      {[[200, 82], [222, 78], [185, 88]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={6} height={4} fill="#ff6b8a" opacity={0.8} />
      ))}
      <text x={20} y={200} fill={STELLAR} opacity={0.6} fontSize={10} fontFamily="var(--font-mono)">{t("cutout")}</text>
    </>
  );
}

function EpochsVisual() {
  const t = useTranslations("landing.pipeline.visual");
  const reduce = useReducedMotion();
  return (
    <>
      {[0, 1].map((f) => (
        <g key={f} transform={`translate(${30 + f * 180}, 30)`}>
          <rect width={150} height={150} fill="#0B1020" stroke={f ? ION : SIGNAL} />
          {STARS.slice(0, 18).map((s, i) => (
            <circle key={i} cx={(s.x % 140) + 5} cy={(s.y % 140) + 5} r={s.r} fill={STELLAR} opacity={0.7} />
          ))}
          <circle cx={f ? 82 : 74} cy={70} r={3} fill={ION} />
          <text x={0} y={168} fill={STELLAR} opacity={0.6} fontSize={10} fontFamily="var(--font-mono)">{f ? t("epochB") : t("epochA")}</text>
        </g>
      ))}
      {!reduce && (
        <motion.rect x={30} y={30} width={150} height={150} fill="none" stroke={ION} strokeWidth={2} animate={{ x: [30, 210, 30] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
      )}
    </>
  );
}

function Variation() {
  const t = useTranslations("landing.pipeline.visual");
  const cells = Array.from({ length: 12 * 8 }, (_, i) => i);
  return (
    <>
      {cells.map((i) => {
        const x = i % 12;
        const y = Math.floor(i / 12);
        const hot = (x === 5 && y === 3) || (x === 6 && y === 3);
        const cold = x === 4 && y === 3;
        const fill = hot ? ION : cold ? NEBULA : SIGNAL;
        const opacity = hot || cold ? 0.85 : 0.05 + ((x * 7 + y * 3) % 5) * 0.025;
        return (
          <motion.rect key={i} x={40 + x * 27} y={20 + y * 22} width={25} height={20} fill={fill} initial={{ opacity: 0 }} animate={{ opacity }} transition={{ delay: (x + y) * 0.03 }} />
        );
      })}
      <text x={40} y={210} fill={STELLAR} opacity={0.6} fontSize={10} fontFamily="var(--font-mono)">{t("differenceMap")}</text>
    </>
  );
}

const JOURNAL_ROWS = ["target", "coordinates", "observations", "notes", "export"] as const;

function Journal() {
  const t = useTranslations("landing.pipeline.visual.journalRows");
  return (
    <>
      <rect x={70} y={20} width={260} height={180} rx={4} fill="#0B1020" stroke={SIGNAL} />
      {JOURNAL_ROWS.map((r, i) => (
        <motion.g key={r} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 * i }}>
          <text x={90} y={52 + i * 30} fill={STELLAR} opacity={0.75} fontSize={11} fontFamily="var(--font-mono)">{t(r)}</text>
          <rect x={210} y={44 + i * 30} width={100 - i * 8} height={8} rx={2} fill={i === 4 ? ION : SIGNAL} opacity={0.5} />
        </motion.g>
      ))}
    </>
  );
}

const VISUALS: Record<PipelineVisualKind, () => JSX.Element> = {
  region: Region,
  query: Query,
  fits: Fits,
  epochs: EpochsVisual,
  variation: Variation,
  journal: Journal,
};

export default function PipelineVisual({ kind }: { kind: PipelineVisualKind }) {
  const t = useTranslations("landing.pipeline");
  const Visual = VISUALS[kind];
  return (
    <svg viewBox="0 0 400 220" className="h-auto w-full" role="img" aria-label={t(`diagram.${kind}`)}>
      <Visual />
    </svg>
  );
}
