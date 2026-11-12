"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center p-6" role="alert">
      <div className="max-w-md rounded border border-line bg-deep p-5 text-center">
        <h1 className="text-base font-bold text-starlight">Algo salió mal</h1>
        <p className="mt-2 text-xs text-mutedstar">
          La pantalla tuvo un error inesperado. Tu investigación guardada no se ha borrado.
          {error.digest ? ` Referencia: ${error.digest}.` : ""}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded bg-pulse px-3 py-1.5 text-xs font-bold text-abyss hover:brightness-110"
          >
            Reintentar
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="rounded border border-line px-3 py-1.5 text-xs text-starlight hover:border-pulse">
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
