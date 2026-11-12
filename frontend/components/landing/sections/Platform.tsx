"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { APP_ENTRY, MODULES } from "../content";
import { scrollToChapter } from "../hooks";

export default function Platform() {
  const [selected, setSelected] = useState(0);
  const [live, setLive] = useState(false);
  const mod = MODULES[selected];

  const choose = (i: number) => {
    setSelected(i);
    setLive(false);
  };

  return (
    <section id="platform" data-chapter aria-labelledby="platform-title" className="relative flex min-h-[140vh] items-center px-4 py-24 md:px-10">
      <div className="grid w-full gap-10 md:grid-cols-12">
        <div className="landing-scrim md:col-span-4">
          <h2 id="platform-title" className="landing-h2">Explore the origin</h2>
          <p className="landing-body mt-4">
            Six tools, one investigation. Each is a real part of the platform you can open right now.
          </p>
          <div role="tablist" aria-label="Platform modules" className="mt-6 grid gap-1">
            {MODULES.map((m, i) => (
              <button
                key={m.href}
                type="button"
                role="tab"
                id={`module-${i}`}
                aria-selected={selected === i}
                aria-controls="module-panel"
                onClick={() => choose(i)}
                className="landing-focus landing-step"
              >
                {m.name}
              </button>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={APP_ENTRY} className="landing-focus landing-button landing-button--primary">
              Start Your Exploration
            </Link>
            <a href="#mission" onClick={(e) => { e.preventDefault(); scrollToChapter("mission"); }} className="landing-focus landing-button landing-button--ghost">
              Explore the Science
            </a>
          </div>
        </div>

        <div className="md:col-span-7 md:col-start-6">
          <div className="landing-window" id="module-panel" role="tabpanel" aria-labelledby={`module-${selected}`}>
            <div className="landing-window__bar">
              <span className="landing-window__dots" aria-hidden />
              <span className="font-mono text-[11px] text-stellar/55">theoriginproject{mod.href === "/" ? "/" : mod.href}</span>
            </div>
            <div className="relative aspect-[16/10] w-full overflow-hidden">
              <AnimatePresence mode="wait">
                {live ? (
                  <motion.iframe
                    key={`live-${mod.href}`}
                    src={mod.href}
                    title={`Live preview of ${mod.name}`}
                    loading="lazy"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 h-full w-full border-0 bg-void"
                  />
                ) : (
                  <motion.div
                    key={mod.href}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 flex flex-col justify-end p-6 md:p-10"
                  >
                    <p className="font-display text-3xl font-light text-stellar md:text-5xl">{mod.name}</p>
                    <p className="mt-3 max-w-md text-sm leading-relaxed text-stellar/70">{mod.purpose}</p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button type="button" onClick={() => setLive(true)} className="landing-focus landing-button landing-button--ghost hidden md:inline-flex">
                        Load live preview
                      </button>
                      <Link href={mod.href} className="landing-focus landing-button landing-button--ghost">
                        Open {mod.name}
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <p className="mt-3 text-xs text-stellar/45">
            The live preview loads the running application itself, not a mock-up.
          </p>
        </div>
      </div>
    </section>
  );
}
