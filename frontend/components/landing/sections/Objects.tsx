"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TARGETS } from "../content";
import { stage } from "../stage";

const LOOK_FOR = { motion: "Look for: motion", brightness: "Look for: brightness change" } as const;

export default function Objects() {
  const [selected, setSelected] = useState(0);
  const target = TARGETS[selected];

  useEffect(() => {
    stage.target = selected;
  }, [selected]);

  return (
    <section id="objects" data-chapter aria-labelledby="objects-title" className="relative md:h-[190vh]">
      <div className="flex min-h-[100svh] md:sticky md:top-0 items-center px-4 py-20 md:px-10">
        <div className="grid w-full gap-8 md:grid-cols-12">
          <div className="landing-scrim md:col-span-5">
            <h2 id="objects-title" className="landing-h2">Objects worth exploring</h2>
            <p className="landing-body mt-4">
              The challenge names five test targets: three that move across the sky and two whose light changes. Choose one
              to turn the sky towards it.
            </p>
            <ul role="tablist" aria-label="Challenge targets" className="mt-6 grid gap-1">
              {TARGETS.map((t, i) => (
                <li key={t.key} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    id={`tab-${t.key}`}
                    aria-selected={selected === i}
                    aria-controls="target-panel"
                    onClick={() => setSelected(i)}
                    className="landing-focus landing-target-tab"
                    style={{ ["--target" as string]: t.color }}
                  >
                    <span className={`landing-glyph landing-glyph--${t.phenomenon}`} aria-hidden />
                    <span className="font-display text-lg text-stellar">{t.name}</span>
                    <span className="ml-auto text-xs text-stellar/50">{t.phenomenon === "motion" ? "moves" : "varies"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-5 md:col-start-8 md:self-end">
            <AnimatePresence mode="wait">
              <motion.article
                key={target.key}
                id="target-panel"
                role="tabpanel"
                aria-labelledby={`tab-${target.key}`}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="landing-panel"
                style={{ ["--target" as string]: target.color }}
              >
                <p className="text-xs text-[color:var(--target)]">{LOOK_FOR[target.phenomenon]}</p>
                <h3 className="mt-2 font-display text-2xl text-stellar">{target.name}</h3>
                <p className="text-sm text-stellar/60">{target.kind}</p>
                <p className="mt-4 text-sm leading-relaxed text-stellar/80">{target.summary}</p>
                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-[11px]">
                  <div>
                    <dt className="text-stellar/45">RA (J2000)</dt>
                    <dd className="text-stellar/85">{target.ra}</dd>
                  </div>
                  <div>
                    <dt className="text-stellar/45">Dec (J2000)</dt>
                    <dd className="text-stellar/85">{target.dec}</dd>
                  </div>
                  <div>
                    <dt className="text-stellar/45">SPHEREx archive</dt>
                    <dd className="text-stellar/85">{target.coverage}</dd>
                  </div>
                  <div>
                    <dt className="text-stellar/45">Time span</dt>
                    <dd className="text-stellar/85">{target.span}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-stellar/60">{target.note}</p>
                <p className="mt-3 text-xs text-stellar/45">
                  Archive coverage from the project&apos;s data audit (11 Nov 2026). No variation has been measured by the
                  platform yet; sequences for this target are being validated.
                </p>
                <Link href="/living-sky" className="landing-focus landing-button landing-button--primary mt-6">
                  Explore observations
                </Link>
              </motion.article>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
