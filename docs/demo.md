# Demo: Planet X and SPHEREx

Guion de cuatro minutos, los cinco enlaces permanentes y qué hacer si algo falla.
Fuente del guion: `docs/auditoria-nasa-space-apps-2026.md` §13.

## Antes de subir al escenario

1. Con el backend desplegado y la red hacia IRSA disponible, calienta la caché:

   ```bash
   cd backend
   python scripts/warm_targets.py --api https://<api> --frontend https://<web>
   ```

   Imprime una línea por objetivo y variante (con y sin cuadro WISE). Sale con código
   distinto de cero si algún objetivo tiene menos de dos visitas.
2. Comprueba sin reintentos:
   `python scripts/warm_targets.py --check --api https://<api> --frontend https://<web>`.
3. Abre cada enlace en una ventana privada: debe llegar al video sin iniciar sesión.

## Los cinco enlaces permanentes

Las coordenadas son las de catálogo J2000 de SIMBAD; para los objetivos rápidos el
servidor recentra la secuencia en la posición propagada a la época media de las
observaciones. Sustituye `<web>` por la URL desplegada.

| Objetivo | Fenómeno | Enlace |
|---|---|---|
| Barnard's Star | desplazamiento | `<web>/time-explorer?ra=269.452077&dec=4.693365&fov=6&mode=motion` |
| Epsilon Indi B | desplazamiento | `<web>/time-explorer?ra=331.044147&dec=-56.782844&fov=6&mode=motion` |
| WISE 0855 | desplazamiento | `<web>/time-explorer?ra=133.818908&dec=-7.247048&fov=6&mode=motion` |
| RW Aurigae | cambio de brillo | `<web>/time-explorer?ra=76.956526&dec=30.401438&fov=6&mode=brightness` |
| R Draconis | cambio de brillo | `<web>/time-explorer?ra=248.167611&dec=66.754979&fov=6&mode=brightness` |

Añade `&ref=1` para incluir el cuadro AllWISE de referencia y `&embed=1` para el modo
incrustado.

## Guion (cuatro minutos)

| Tiempo | Qué se muestra | Qué se dice |
|---|---|---|
| 0:00-0:30 | Portada con los cinco objetivos | "SPHEREx fotografía todo el cielo cada seis meses en 102 colores. Nadie puede revisarlo a mano. Esta herramienta deja que cualquiera lo haga." |
| 0:30-1:20 | Barnard's Star, con marcas de Gaia y trayectoria | "Cada cuadro es una visita real de SPHEREx, alineada. La estrella se mueve sobre un fondo fijo, justo por donde el catálogo predice." |
| 1:20-2:10 | R Draconis, curva de luz | "Esta estrella cambia de brillo. ¿Cómo sabemos que es ella y no el instrumento? Comparamos con estrellas vecinas, que no cambian, y restamos la luz zodiacal." Si no hay estrellas de comparación, decirlo: la curva es absoluta y así queda rotulada. |
| 2:10-3:10 | WISE 0855, modo Planeta X y termómetro de color | "Este objeto es casi invisible en cada imagen. Sumando las visitas a lo largo del movimiento aparece. Es frío: solo brilla en el infrarrojo largo." Decir "señal compatible", nunca "detección confirmada". |
| 3:10-3:40 | Verificación y evidencia | "Antes de llamar candidato a algo comprobamos catálogos de estrellas y de asteroides, y guardamos todo con un hash verificable." |
| 3:40-4:00 | Enlace copiado y video exportado | "Cada resultado es un enlace que cualquiera puede abrir, incrustar o verificar." |

No afirmar nada que no esté marcado como cumplido en `docs/challenge.md`.

## Si algo falla en el escenario

| Síntoma | Qué pasa | Qué hacer |
|---|---|---|
| IRSA no responde | El servidor sirve la última secuencia real de esa misma petición con la insignia "Consultado el <fecha>, desde caché" | Decirlo en voz alta: son datos reales de esa fecha. Nunca se muestran datos sintéticos |
| Un objetivo no tiene caché ni red | El job falla con "The SPHEREx archive did not answer" | Pasa al siguiente objetivo; no improvises un resultado |
| Faltan cuadros (servicio de recortes con `503`) | La secuencia sale con menos cuadros y lo avisa en `limitations` | Reintenta el calentamiento más tarde; mientras tanto la secuencia sigue siendo válida si tiene dos visitas o más |
| Gaia o SkyBoT no responden | Las marcas de Gaia quedan desactivadas y la verificación figura "no comprobada" | Explícalo: el sistema nunca llama "sin explicar" a un candidato por omisión |
| La sesión de Supabase falla | Solo afecta a guardar en el diario | Todo lo demás es anónimo |

## Datos reales verificados hasta ahora

Se actualiza después de cada calentamiento (`docs/challenge.md` es la fuente de verdad).

| Fecha | Objetivo | Detector | Cuadros usados / productos | Observaciones |
|---|---|---|---|---|
| 2026-11-12 | Barnard's Star | D6 | 12 / 382 | Desplazamiento previsto 11,4″; apilado con su movimiento propio, pico en el píxel previsto |
| 2026-11-12 | Epsilon Indi B | D6 | 12 / 466 | Desplazamiento previsto 6,6″ |
| 2026-11-12 | WISE 0855 | D6 | 12 / 288 | SNR mediana 3,4 por cuadro; apilado con su movimiento propio: σ 11,8, p < 0,001, pico en el píxel previsto; cuadro AllWISE W2 real |
| 2026-11-12 | RW Aurigae | D1 | 9 / 340 | Curva relativa con 4 estrellas de comparación |
| 2026-11-12 | R Draconis | D1 | 10 / 2572 | El núcleo satura en todos los detectores; curva por amplitud de las alas de la PSF, rango 0,63 a 1,64 |

Con la ruta hacia IRSA cortada, los cinco enlaces (con y sin cuadro de referencia) siguieron
mostrando su secuencia real con la insignia "Consultado el <fecha>, desde caché".

## Prueba con personas sin formación en astronomía (WP-32)

Criterio: una persona, sin ayuda, llega al video de un objetivo y explica qué cambió.
Anota los resultados aquí; al menos tres personas.

| Persona (iniciales) | ¿Llegó sola al video? | ¿Qué dijo que cambió? | Dudas |
|---|---|---|---|
| (pendiente) | | | |
| (pendiente) | | | |
| (pendiente) | | | |
