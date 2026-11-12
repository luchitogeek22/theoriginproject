import { useTranslations } from "next-intl";
import SpectralBands from "../ui/SpectralBands";

const FACTS = ["bands", "range", "cadence"] as const;

export default function Mission() {
  const t = useTranslations("landing.mission");
  return (
    <section id="mission" data-chapter aria-labelledby="mission-title" className="relative flex min-h-[170vh] items-center px-4 md:px-10">
      <div className="landing-scrim w-full max-w-xl py-16">
        <h2 id="mission-title" className="landing-h2">{t("title")}</h2>
        <p className="landing-body mt-5">
          {t("body")}
        </p>
        <dl className="mt-8 grid gap-5 sm:grid-cols-3">
          {FACTS.map((f) => (
            <div key={f}>
              <dt className="font-display text-2xl font-light text-stellar">{t(`facts.${f}.value`)}</dt>
              <dd className="mt-1 text-xs leading-snug text-stellar/60">{t(`facts.${f}.label`)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-10">
          <p className="mb-3 text-sm text-stellar/80">{t("bandsPrompt")}</p>
          <SpectralBands />
        </div>
        <p className="mt-6 text-xs text-stellar/45">
          {t("disclaimer")}
        </p>
      </div>
    </section>
  );
}
