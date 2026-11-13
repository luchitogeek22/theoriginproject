import { useTranslations } from "next-intl";

export default function Explore() {
  const t = useTranslations("landing.explore");
  return (
    <section id="explore" data-chapter aria-labelledby="explore-title" className="relative flex min-h-[150vh] items-center landing-gutter">
      <div className="landing-scrim max-w-lg py-16">
        <h2 id="explore-title" className="landing-h2">{t("title")}</h2>
        <p className="landing-body mt-5">
          {t("body")}
        </p>
        <dl className="mt-8 grid gap-4 text-sm">
          <div>
            <dt className="font-mono text-xs text-pulse">{t("grid.term")}</dt>
            <dd className="text-stellar/70">{t("grid.detail")}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs text-stellar">{t("constellations.term")}</dt>
            <dd className="text-stellar/70">{t("constellations.detail")}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs text-stellar">{t("markers.term")}</dt>
            <dd className="text-stellar/70">{t("markers.detail")}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
