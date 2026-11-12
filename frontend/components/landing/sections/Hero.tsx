"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { APP_ENTRY } from "../content";
import { scrollToChapter } from "../hooks";

export default function Hero() {
  const reduce = useReducedMotion();
  const reveal = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 18, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 1.1, delay, ease: [0.16, 1, 0.3, 1] },
        };

  return (
    <section id="origin" data-chapter aria-labelledby="origin-title" className="relative flex min-h-[100svh] flex-col justify-end px-4 pb-10 pt-24 md:px-10 md:pb-14">
      <motion.p {...reveal(1.4)} className="landing-wordmark font-display" aria-hidden>
        THE ORIGIN PROJECT
      </motion.p>
      <div className="mt-6 grid gap-6 md:mt-8 md:grid-cols-12 md:items-end">
        <motion.h1 id="origin-title" {...reveal(1.7)} className="font-display text-[2rem] font-light leading-[1.05] text-stellar md:col-span-6 md:text-[3.4rem]">
          <span className="sr-only">The Origin Project. </span>
          Explore the universe. Discover what changes.
        </motion.h1>
        <motion.div {...reveal(2)} className="md:col-span-5 md:col-start-8">
          <p className="max-w-md text-[15px] leading-relaxed text-stellar/70">
            An interactive scientific platform to explore real SPHEREx observations and investigate the dynamic universe.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={APP_ENTRY} className="landing-focus landing-button landing-button--primary">
              Start Exploring
            </Link>
            <a href="#mission" onClick={(e) => { e.preventDefault(); scrollToChapter("mission"); }} className="landing-focus landing-button landing-button--ghost">
              Discover the Mission
            </a>
          </div>
        </motion.div>
      </div>
      <p className="mt-10 font-mono text-[11px] text-stellar/40">
        Planet and orbits are an illustration. Every number on this page is either sourced or labelled as simulated.
      </p>
    </section>
  );
}
