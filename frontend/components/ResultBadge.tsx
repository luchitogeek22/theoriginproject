import { useTranslations } from "next-intl";

const KINDS = {
  observation: { cls: "border-emerald-400/60 text-emerald-300" },
  calculation: { cls: "border-pulse/60 text-pulse" },
  candidate: { cls: "border-violet-400/60 text-violet-300" },
} as const;

export type ResultKind = keyof typeof KINDS;

export default function ResultBadge({ kind }: { kind: ResultKind }) {
  const t = useTranslations("resultBadge");
  const k = KINDS[kind];
  return (
    <span
      title={t(`${kind}.title`)}
      className={`inline-block rounded border px-1.5 py-px align-middle text-[9px] font-bold tracking-wider ${k.cls}`}
    >
      {t(`${kind}.label`)}
    </span>
  );
}
