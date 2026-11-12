import Link from "next/link";
import { APP_ENTRY, SOURCES } from "../content";

export default function Finale() {
  return (
    <section id="question" data-chapter aria-labelledby="question-title" className="relative flex min-h-[100svh] flex-col px-4 pt-24 md:px-10">
      <div className="flex flex-1 flex-col items-start justify-center md:items-end md:text-right">
        <h2 id="question-title" className="max-w-xl font-display text-[2.2rem] font-light leading-[1.08] text-stellar md:text-[3.6rem]">
          Every discovery begins with a question.
        </h2>
        <p className="mt-6 font-display text-[13px] font-semibold tracking-[0.32em] text-stellar/80">THE ORIGIN PROJECT</p>
        <Link href={APP_ENTRY} className="landing-focus landing-button landing-button--primary mt-8">
          Enter the platform
        </Link>
      </div>
      <footer className="flex flex-col gap-4 border-t border-stellar/10 py-6 text-xs text-stellar/55 md:flex-row md:items-center md:justify-between">
        <p>Built for the 2026 NASA Space Apps Challenge · Planet X and SPHEREx. SPHEREx data: NASA/JPL-Caltech, NASA/IPAC IRSA.</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {SOURCES.map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noreferrer" className="landing-focus underline-offset-4 hover:text-stellar hover:underline">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </section>
  );
}
