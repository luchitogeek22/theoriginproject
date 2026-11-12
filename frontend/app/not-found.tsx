import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded border border-line bg-deep p-5 text-center">
        <h1 className="text-base font-bold text-starlight">Página no encontrada</h1>
        <p className="mt-2 text-xs text-mutedstar">La dirección no existe o fue movida.</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded bg-pulse px-3 py-1.5 text-xs font-bold text-abyss hover:brightness-110"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
