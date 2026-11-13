"use client";

import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { APP_ENTRY } from "../content";
import { scrollToChapter } from "../hooks";

export default function Hero() {
  const t = useTranslations("landing.hero");
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
    <section id="origin" data-chapter aria-labelledby="origin-title" className="landing-gutter relative flex min-h-[100svh] flex-col justify-end pb-10 pt-24 md:pb-14">
      <motion.p {...reveal(1.4)} className="landing-wordmark font-display" aria-hidden>
        THE ORIGIN PROJECT
      </motion.p>
      <div className="mt-6 grid gap-6 md:mt-8 md:grid-cols-12 md:items-end">
        <motion.h1 id="origin-title" {...reveal(1.7)} className="font-display text-[2rem] font-light leading-[1.05] text-stellar md:col-span-6 md:text-[3.4rem]">
          <span className="sr-only">{t("srTitle")}</span>
          {t("title")}
        </motion.h1>
        <motion.div {...reveal(2)} className="md:col-span-5 md:col-start-8">
          <p className="max-w-md text-[15px] leading-relaxed text-stellar/70">
            {t("lead")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={APP_ENTRY} className="landing-focus landing-button landing-button--primary">
              {t("start")}
            </Link>
            <a href="#mission" onClick={(e) => { e.preventDefault(); scrollToChapter("mission"); }} className="landing-focus landing-button landing-button--ghost">
              {t("discover")}
            </a>
          </div>
        </motion.div>
      </div>
      <p className="mt-10 font-mono text-[11px] text-stellar/40">
        {t("disclaimer")}
      </p>
    </section>
  );
}
