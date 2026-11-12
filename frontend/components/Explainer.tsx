const ITEMS: Array<{ title: string; body: string }> = [
  {
    title: "¿Qué es cada cuadro?",
    body: "Una exposición real del telescopio SPHEREx sobre ese trozo de cielo: un solo detector, una sola fecha. No es una simulación ni una imagen promediada.",
  },
  {
    title: "¿Por qué cambian el brillo y el color entre cuadros?",
    body: "SPHEREx mira cada punto con un filtro que cambia de color y con seis detectores distintos. Un cambio entre cuadros puede venir del instrumento y no del objeto; por eso conviene fijar un detector.",
  },
  {
    title: "¿Qué es la luz zodiacal?",
    body: "Es luz del Sol dispersada por el polvo del Sistema Solar. Es un fondo brillante en el infrarrojo y se resta de cada cuadro antes de mostrarlo.",
  },
  {
    title: "¿Qué significa la escala?",
    body: "Modo Movimiento: cada cuadro usa su propio nivel de ruido como unidad, así que sirve para ver desplazamientos pero no para comparar brillo. Modo Brillo: todos los cuadros comparten una escala física fija, así que el brillo sí es comparable.",
  },
  {
    title: "¿Qué son las banderas y la cobertura?",
    body: "Las banderas marcan píxeles poco fiables (rayos cósmicos, saturación, píxeles muertos). La cobertura es la parte del recorte que tiene datos reales. Con muchas banderas o poca cobertura, interpreta con cautela.",
  },
  {
    title: "¿Por qué un objeto en movimiento se mueve menos de un píxel?",
    body: "Los píxeles de SPHEREx son grandes (unos 6″). Un objeto lento puede desplazarse menos que eso entre dos fechas, y entonces el cambio se nota en el reparto de luz, no como un salto visible.",
  },
  {
    title: "Candidatos no son descubrimientos",
    body: "Un candidato es una señal que la herramienta marca para revisar. Hasta que otras observaciones independientes la confirmen, no es un hallazgo.",
  },
];

export default function Explainer() {
  return (
    <details className="rounded border border-line bg-deep" aria-label="¿Qué estoy viendo?">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-starlight">¿Qué estoy viendo?</summary>
      <div className="flex flex-col gap-2 border-t border-line p-3 text-[11px] leading-snug text-mutedstar">
        {ITEMS.map((item) => (
          <div key={item.title}>
            <h3 className="font-semibold text-starlight">{item.title}</h3>
            <p className="mt-0.5">{item.body}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
