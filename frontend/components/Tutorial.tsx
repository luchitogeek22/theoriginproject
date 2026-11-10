"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";

const STEPS = [
  { title: "Explora el cielo", body: "Arrastra para girar la esfera celeste y usa la rueda para acercar. Cada punto dorado es una estrella de referencia; los contornos cian son observaciones reales." },
  { title: "Elige un objetivo", body: "Busca por nombre o coordenadas. WISE 0855 es un buen comienzo: una enana marrón fría con movimiento propio." },
  { title: "Viaja en el tiempo", body: "En Time Explorer verás las épocas reales disponibles. Compara el antes y el después con imágenes del archivo." },
  { title: "Comprende la evidencia", body: "Cada resultado indica su origen, incertidumbre y limitaciones. Guarda tu investigación en el Journal con trazabilidad completa." },
];

export default function Tutorial() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem("origin-tutorial-done")) setStep(0);
    } catch {
      setStep(0);
    }
  }, []);

  const close = () => {
    setStep(null);
    try {
      localStorage.setItem("origin-tutorial-done", "1");
    } catch { /* noop */ }
  };

  return (
    <AnimatePresence>
      {step !== null && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,430px)] -translate-x-1/2 rounded-lg border border-line bg-panel p-4 shadow-2xl"
          role="dialog"
          aria-label="Tutorial"
        >
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-widest text-pulse">Paso {step + 1} de 4</p>
            <button onClick={close} aria-label="Cerrar tutorial" className="text-mutedstar hover:text-starlight">
              <X size={15} />
            </button>
          </div>
          <p className="mb-1 text-sm font-semibold text-starlight">{STEPS[step].title}</p>
          <p className="mb-3 text-xs leading-relaxed text-mutedstar">{STEPS[step].body}</p>
          <div className="flex justify-between">
            <button onClick={close} className="text-xs text-mutedstar hover:text-starlight">
              Omitir
            </button>
            <button
              onClick={() => (step >= 3 ? close() : setStep(step + 1))}
              className="flex items-center gap-1 rounded bg-pulse px-3 py-1.5 text-xs font-semibold text-abyss hover:brightness-110"
            >
              {step >= 3 ? "Empezar" : "Siguiente"} <ArrowRight size={13} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
