"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { TARGETS, type ChallengeTarget } from "../content";
import { stage } from "../stage";

export default function Objects() {
  const t = useTranslations("landing.objects");
  const format = useFormatter();
  const [selected, setSelected] = useState(0);
  const target = TARGETS[selected];

  const exposures = (e: ChallengeTarget["exposures"]) => {
    const count = format.number(e.count);
    return e.approximate ? t("exposuresApprox", { count }) : t("exposures", { count });
  };
  const span = (s: ChallengeTarget["span"]) => {
    if (s.kind === "days") {
      const days = format.number(s.days);
      return s.perDetector ? t("spanDaysPerDetector", { days }) : t("spanDays", { days });
    }
    const month = ([year, m]: [number, number]) =>
      format.dateTime(new Date(Date.UTC(year, m - 1, 1)), { month: "short", year: "numeric", timeZone: "UTC" });
    return t("spanMonths", { from: month(s.from), to: month(s.to) });
  };

  useEffect(() => {
    stage.target = selected;
  }, [selected]);

  return (
    <section id="objects" data-chapter aria-labelledby="objects-title" className="relative md:h-[190vh]">
      <div className="flex min-h-[100svh] md:sticky md:top-0 items-center px-4 py-20 md:px-10">
        <div className="grid w-full gap-8 md:grid-cols-12">
          <div className="landing-scrim md:col-span-5">
            <h2 id="objects-title" className="landing-h2">{t("title")}</h2>
            <p className="landing-body mt-4">
              {t("body")}
            </p>
            <ul role="tablist" aria-label={t("tabsLabel")} className="mt-6 grid gap-1">
              {TARGETS.map((item, i) => (
                <li key={item.key} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    id={`tab-${item.key}`}
                    aria-selected={selected === i}
                    aria-controls="target-panel"
                    onClick={() => setSelected(i)}
                    className="landing-focus landing-target-tab"
                    style={{ ["--target" as string]: item.color }}
                  >
                    <span className={`landing-glyph landing-glyph--${item.phenomenon}`} aria-hidden />
                    <span className="font-display text-lg text-stellar">{item.name}</span>
                    <span className="ml-auto text-xs text-stellar/50">{t(`badge.${item.phenomenon}`)}</span>
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
                <p className="text-xs text-[color:var(--target)]">{t(`lookFor.${target.phenomenon}`)}</p>
                <h3 className="mt-2 font-display text-2xl text-stellar">{target.name}</h3>
                <p className="text-sm text-stellar/60">{t(`targets.${target.key}.kind`)}</p>
                <p className="mt-4 text-sm leading-relaxed text-stellar/80">{t(`targets.${target.key}.summary`)}</p>
                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-[11px]">
                  <div>
                    <dt className="text-stellar/45">{t("ra")}</dt>
                    <dd className="text-stellar/85">{target.ra}</dd>
                  </div>
                  <div>
                    <dt className="text-stellar/45">{t("dec")}</dt>
                    <dd className="text-stellar/85">{target.dec}</dd>
                  </div>
                  <div>
                    <dt className="text-stellar/45">{t("archive")}</dt>
                    <dd className="text-stellar/85">{exposures(target.exposures)}</dd>
                  </div>
                  <div>
                    <dt className="text-stellar/45">{t("timeSpan")}</dt>
                    <dd className="text-stellar/85">{span(target.span)}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-stellar/60">{t(`targets.${target.key}.note`)}</p>
                <p className="mt-3 text-xs text-stellar/45">
                  {t("auditNote")}
                </p>
                <Link href="/living-sky" className="landing-focus landing-button landing-button--primary mt-6">
                  {t("cta")}
                </Link>
              </motion.article>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
