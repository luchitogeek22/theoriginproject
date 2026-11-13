import { useTranslations } from "next-intl";

const TERMS = [
  "spherex",
  "irsa",
  "exposure",
  "detector",
  "wavelength",
  "properMotion",
  "zodiacalLight",
  "flag",
  "coverage",
  "lightCurve",
  "brownDwarf",
  "candidate",
] as const;

export default function Glossary() {
  const t = useTranslations("glossary");
  return (
    <details className="rounded border border-line bg-deep/60">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-mutedstar">{t("title")}</summary>
      <dl className="grid gap-x-6 gap-y-1.5 p-3 text-[11px] text-mutedstar md:grid-cols-2">
        {TERMS.map((term) => (
          <div key={term}>
            <dt className="inline font-semibold text-starlight">{t(`terms.${term}.term`)}: </dt>
            <dd className="inline">{t(`terms.${term}.definition`)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
