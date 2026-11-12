const KINDS = {
  observation: {
    label: "OBSERVACIÓN",
    title: "Datos medidos por SPHEREx tal como están en el archivo.",
    cls: "border-emerald-400/60 text-emerald-300",
  },
  calculation: {
    label: "CÁLCULO",
    title: "Resultado calculado por esta herramienta a partir de las observaciones.",
    cls: "border-pulse/60 text-pulse",
  },
  candidate: {
    label: "CANDIDATO",
    title: "Señal marcada para revisar. No es un descubrimiento confirmado.",
    cls: "border-violet-400/60 text-violet-300",
  },
} as const;

export type ResultKind = keyof typeof KINDS;

export default function ResultBadge({ kind }: { kind: ResultKind }) {
  const k = KINDS[kind];
  return (
    <span
      title={k.title}
      className={`inline-block rounded border px-1.5 py-px align-middle text-[9px] font-bold tracking-wider ${k.cls}`}
    >
      {k.label}
    </span>
  );
}
