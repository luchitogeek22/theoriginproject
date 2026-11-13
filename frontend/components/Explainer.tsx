import { useTranslations } from "next-intl";

const ITEMS = ["frame", "colour", "zodiacal", "scale", "flags", "subpixel", "candidates"] as const;

export default function Explainer() {
  const t = useTranslations("explainer");
  return (
    <details className="rounded border border-line bg-deep" aria-label={t("title")}>
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-starlight">{t("title")}</summary>
      <div className="flex flex-col gap-2 border-t border-line p-3 text-[11px] leading-snug text-mutedstar">
        {ITEMS.map((item) => (
          <div key={item}>
            <h3 className="font-semibold text-starlight">{t(`items.${item}.title`)}</h3>
            <p className="mt-0.5">{t(`items.${item}.body`)}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
