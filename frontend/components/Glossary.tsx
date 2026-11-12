const TERMS: Array<[string, string]> = [
  ["SPHEREx", "Telescopio espacial de la NASA que mapea todo el cielo en infrarrojo con muchos colores."],
  ["IRSA", "Archivo de la NASA/IPAC donde se guardan los datos de SPHEREx."],
  ["Exposición", "Una toma del telescopio: un detector, una fecha, un trozo de cielo."],
  ["Detector", "Cada uno de los seis sensores de SPHEREx; cada uno ve el mismo cielo con otro rango de color."],
  ["Longitud de onda", "El «color» infrarrojo de la luz medida, en micrómetros (µm)."],
  ["Movimiento propio", "Desplazamiento lento de una estrella en el cielo a lo largo de los años."],
  ["Luz zodiacal", "Fondo de luz solar dispersada por polvo del Sistema Solar; se resta."],
  ["Bandera", "Marca de un píxel poco fiable (rayo cósmico, saturación, píxel muerto)."],
  ["Cobertura", "Parte del recorte que tiene datos reales."],
  ["Curva de luz", "Gráfico del brillo de un objeto a lo largo del tiempo."],
  ["Enana marrón", "Objeto más grande que un planeta y más pequeño que una estrella: no llega a encender hidrógeno."],
  ["Candidato", "Señal por revisar; no es un descubrimiento confirmado."],
];

export default function Glossary() {
  return (
    <details className="rounded border border-line bg-deep/60">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-mutedstar">Glosario</summary>
      <dl className="grid gap-x-6 gap-y-1.5 p-3 text-[11px] text-mutedstar md:grid-cols-2">
        {TERMS.map(([term, def]) => (
          <div key={term}>
            <dt className="inline font-semibold text-starlight">{term}: </dt>
            <dd className="inline">{def}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
