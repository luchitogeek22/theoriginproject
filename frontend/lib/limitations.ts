const RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [
    /^Detectors? (.+?) (?:was|were) excluded: a sequence uses one detector \((D\d)\) because SPHEREx detectors cannot be mixed\.?$/,
    (m) => `Se excluyeron los detectores ${m[1]}: una secuencia usa un solo detector (${m[2]}) porque los detectores de SPHEREx no se pueden mezclar.`,
  ],
  [
    /^(\d+) epochs available; (\d+) evenly spaced ones are shown \(maximum (\d+)\)\.?$/,
    (m) => `Hay ${m[1]} épocas disponibles; se muestran ${m[2]} repartidas a lo largo del tiempo (máximo ${m[3]}).`,
  ],
  [
    /^Each frame is shown in units of its own noise.*$/,
    () => "Cada cuadro se muestra en unidades de su propio ruido: sirve para ver movimiento, no para comparar el brillo entre cuadros.",
  ],
  [
    /^One physical scale for all frames.*$/,
    () => "Una sola escala física para todos los cuadros: los cambios de brillo entre cuadros son reales.",
  ],
  [
    /^Motion mode uses detector D6.*$/,
    () => "El modo movimiento usa por defecto el detector D6 (cerca de 4,4 a 5 µm): los objetos fríos, como las enanas marrones, brillan más en longitudes de onda largas.",
  ],
  [
    /^(\d+) frame\(s\) could not be downloaded and are missing\.?$/,
    (m) => `No se pudieron descargar ${m[1]} cuadro(s); faltan en la secuencia.`,
  ],
  [
    /^Only one epoch is available.*$/,
    () => "Solo hay una época disponible, así que aquí no se puede ver ningún cambio en el tiempo.",
  ],
  [
    /^No frames available to build a sequence at this position\.?$/,
    () => "No hay cuadros disponibles para armar una secuencia en esta posición.",
  ],
  [
    /^(\d+) product\(s\) without a detector were excluded\.?$/,
    (m) => `Se excluyeron ${m[1]} producto(s) sin detector conocido.`,
  ],
  [
    /^Brightness mode keeps frames at the same wavelength: (\d+) of (\d+) are within ±([\d.]+) µm of ([\d.]+) µm\.?$/,
    (m) => `El modo brillo conserva cuadros de la misma longitud de onda: ${m[1]} de ${m[2]} están a ±${m[3]} µm de ${m[4]} µm.`,
  ],
  [
    /^The WISE reference frame could not be retrieved\.?$/,
    () => "No se pudo obtener el cuadro de referencia de WISE.",
  ],
  [
    /^Gaia could not be reached.*$/,
    () => "No se pudo consultar Gaia: no hay estrellas de comparación ni marcas de catálogo.",
  ],
  [
    /^No proper motion known for this position.*$/,
    () => "No se conoce el movimiento propio de esta posición: la fotometría se hace en posición fija.",
  ],
  [
    /^One curve per detector; detectors are never mixed\. No aperture correction\.?$/,
    () => "Una curva por detector; nunca se mezclan detectores. Sin corrección de apertura.",
  ],
  [
    /^The target saturates its core in this detector: the curve uses the amplitude of the PSF wings.*$/,
    () => "El objetivo satura su núcleo en este detector: la curva usa la amplitud de las alas de la PSF (valores relativos, no un flujo).",
  ],
  [
    /^The target is not detected individually in each frame \(median SNR ([\d.]+)\); the curve mostly shows noise\.?$/,
    (m) => `El objetivo no se detecta por separado en cada cuadro (SNR mediana ${m[1]}): la curva refleja sobre todo ruido.`,
  ],
  [
    /^The target is flagged .* in (\d+) of (\d+) frames in detector (D\d); try another detector.*$/,
    (m) => `El objetivo está marcado (saturación o píxeles inutilizables) en ${m[1]} de ${m[2]} cuadros del detector ${m[3]}: prueba otro detector.`,
  ],
  [
    /^The target could not be measured in these frames\.?$/,
    () => "No se pudo medir el objetivo en estos cuadros.",
  ],
  [
    /^absolute flux \(no valid comparison stars\): not corrected for common changes$/,
    () => "flujo absoluto (sin estrellas de comparación válidas): no corregido por cambios comunes",
  ],
  [
    /^relative to comparison stars$/,
    () => "relativo a estrellas de comparación",
  ],
  [
    /^Only (\d+) Gaia star\(s\) were measurable here.*$/,
    (m) => `Solo ${m[1]} estrella(s) de Gaia se pudieron medir aquí (hacen falta al menos 3 sin banderas y con SNR ≥ 10), así que la curva es absoluta.`,
  ],
  [
    /^Archive notice: (.*)$/,
    (m) => `Aviso del archivo: ${m[1]}`,
  ],
  [
    /^Queried on (.+), served from cache$/,
    (m) => `Consultado el ${m[1]}, desde caché`,
  ],
  [
    /^Linear motion over the observation window is assumed.*$/,
    () => "Se supone movimiento lineal durante la ventana de observación; es una aproximación válida para objetos lejanos en año y medio.",
  ],
  [
    /^Pixels that are significantly bright in the median of all visits were treated as static sources.*$/,
    () => "Los píxeles muy brillantes en la mediana de todas las visitas se trataron como fuentes estáticas y se restaron (cada una con su propio brillo por visita); los móviles más lentos que una PSF en toda la ventana pueden restarse con ellas.",
  ],
  [
    /^Velocities below ([\d.]+) arcsec\/yr \(less than ([\d.]+) px over the window\) are not searched.*$/,
    (m) => `No se buscan velocidades menores de ${m[1]}″/año (menos de ${m[2]} px en la ventana): no se distinguen de residuos estáticos.`,
  ],
  [
    /^The best velocity lies at the edge of the searched range.*$/,
    () => "La mejor velocidad está en el borde del rango buscado; amplía el rango antes de fiarte.",
  ],
  [
    /^Velocity grid reduced to (\d+x\d+) to bound the computing cost\.?$/,
    (m) => `La rejilla de velocidades se redujo a ${m[1]} para acotar el costo de cálculo.`,
  ],
  [
    /^At least (\d+) visits are required; found (\d+)\.?$/,
    (m) => `Se necesitan al menos ${m[1]} visitas; hay ${m[2]}.`,
  ],
  [
    /^The empirical p-value compares the predicted position with random positions.*$/,
    () => "El valor p empírico compara la posición prevista con posiciones al azar del mismo apilado; supone que el movimiento propio de catálogo es correcto y que el movimiento es lineal.",
  ],
  [
    /^Total predicted motion over the window is ([\d.]+) px: below about 1\.5 px.*$/,
    (m) => `El movimiento previsto en la ventana es de ${m[1]} px: por debajo de ~1,5 px una búsqueda a ciegas no separa un móvil de una fuente estática, pero un movimiento conocido sí se puede comprobar.`,
  ],
  [
    /^Zodiacal light \(ZODI\) was subtracted from IMAGE\.?$/,
    () => "La luz zodiacal (ZODI) se restó de la imagen.",
  ],
  [
    /^Zodiacal light was subtracted from every exposure\.?$/,
    () => "La luz zodiacal se restó de cada exposición.",
  ],
  [
    /^Different dates are shown in different colours.*$/,
    () => "Las fechas distintas se muestran con colores distintos: un cambio de brillo en el tiempo no es forma espectral.",
  ],
  [
    /^No aperture correction is applied\.?$/,
    () => "No se aplica corrección de apertura.",
  ],
  [
    /^No celestial WCS.*$/,
    () => "Sin WCS celeste: las detecciones no tienen coordenadas en el cielo.",
  ],
];

export function translateLimitation(text: string): string {
  const trimmed = text.trim();
  for (const [pattern, render] of RULES) {
    const match = trimmed.match(pattern);
    if (match) return render(match);
  }
  return text;
}
