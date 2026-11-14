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
        <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs">
          <li className="text-pulse">{t("grid.term")}</li>
          <li className="text-stellar">{t("constellations.term")}</li>
          <li className="text-stellar">{t("markers.term")}</li>
        </ul>
      </div>
    </section>
  );
}
