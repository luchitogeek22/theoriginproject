# Auditoría frente al desafío y plan para ganar — NASA Space Apps 2026 "Planet X and SPHEREx"

Versión 2, 2026-11-11, sobre el commit `8be63e2` (rama `developer`). Sustituye a
la versión del 2026-11-10, que contenía afirmaciones incorrectas (§2).

Este documento responde a dos preguntas:

1. **¿Qué le falta hoy a The Origin Project para cumplir el desafío?** (§3 a §6)
2. **¿Qué tenemos que construir para ganarlo?** (§7 a §13)

Documentos relacionados:

- [challenge.md](challenge.md): el enunciado y sus requisitos. Es la brújula.
- [auditoria-tecnica-arquitectonica.md](auditoria-tecnica-arquitectonica.md):
  diagnóstico técnico completo, la **regla de cambio** (§20, RC-1 a RC-14) y los
  paquetes de trabajo WP-00 a WP-22 (§21). Todo lo que se implemente a partir de
  este documento sigue esa regla de cambio sin excepciones.

**Estado:** diagnóstico y plan pendientes de aprobación. Nada está implementado.

---

## 0. Cómo usar este documento

| Si eres | Lee |
|---|---|
| Responsable que decide | §1, §7, §10, §12 |
| Quien implementa (persona o agente) | §9 completo, luego la regla de cambio del documento técnico (§20) |
| Quien presenta la demo | §4, §11, §13 |

Convenciones:

- `ruta:línea` relativa a la raíz del repositorio, en el commit `8be63e2`.
- **Hecho verificado** cita su fuente (código o documentación oficial).
  **Hipótesis** queda marcada así y tiene un paquete de trabajo que la comprueba.
- Los identificadores de hallazgos (FE-, BE-, SCI-, SEC-, UX-, TST-) y de
  paquetes (WP-00 a WP-22) son los del documento técnico. Este documento añade
  los paquetes WP-23 a WP-32 y enmienda algunos existentes (§9.2).

---

## 1. Veredicto

**Hoy The Origin Project no cumple el núcleo del desafío.** El enunciado pide
una cosa concreta: ingresar coordenadas y ver una serie de imágenes SPHEREx de
ese trozo de cielo como un pequeño video, para detectar a simple vista qué se
movió o cambió de brillo. Ese video no existe, la variabilidad no se puede ver
con la normalización actual y tres de los cinco objetivos quedan fuera del
recorte o descentrados.

Lo que sí tiene valor y se conserva: acceso real a IRSA, procesamiento con
Astropy y reproject, una cultura de honestidad sin datos simulados, y un
backend del tamaño correcto.

**La oportunidad para ganar** está en una propiedad de SPHEREx que casi nadie va
a tratar bien: **cada exposición de SPHEREx ve el cielo en un color distinto.**
Un "video" ingenuo de SPHEREx mezcla dos cambios: el del objeto en el tiempo y
el del color en que se observa. La propuesta de este documento es construir el
primer visor público que separa ambos y lo explica:

> **Un flipbook de SPHEREx que entiende la física:** alinea los cuadros, quita la
> luz zodiacal, compara cada época en el mismo color, sigue el movimiento propio
> previsto, y deja al usuario buscar objetos en movimiento con la misma técnica
> que se usa para buscar el Planeta Nueve.

---

## 2. Correcciones a la versión anterior de este documento

| Afirmación de la versión del 2026-11-10 | Estado real | Evidencia |
|---|---|---|
| "Play/pause real entre épocas" | **Incorrecta**: el botón solo mueve un borde entre tarjetas | `frontend/app/time-explorer/page.tsx:72,242` |
| "Comparación (alternancia) COMPLETO: blink + slider" | **Incorrecta**: no hay parpadeo; solo superposición sin alinear | `frontend/app/time-explorer/page.tsx:320-335` |
| "Detectores COMPLETO, punto fuerte real" | Sobreestimada: la guarda no actúa si el campo viene vacío | `backend/app/services/temporal.py:47` |
| "Extracción espectral real por fila vía WCS-WAVE" | **Incorrecta**: el código lee la extensión 5, que según IRSA es la PSF | `backend/app/services/spectral.py:67-71`; orden de extensiones en la documentación de recortes de IRSA |
| "HDU 4 y 5 nunca leídas" | Incorrecta: la 5 (PSF) se lee como si fuera WCS-WAVE; la 6 (WCS-WAVE) nunca | Igual |
| "44/44 tests pasan" | Hoy son 42, ninguno valida ciencia con verdad inyectada | Documento técnico §14 |
| "Temporalidad: agrupa por MJD" | Imprecisa: una "época" por exposición | `frontend/app/time-explorer/page.tsx:34-43` |
| "WISE 0855 correcto a < 0,001 arcsec" | La conversión es correcta, pero se etiqueta como J2000 una posición de la era WISE y no se propaga el movimiento propio | `backend/app/services/targets.py:16-22` |
| Puntuación ≈ 66/100 | Demasiado optimista; §5 | — |

Afirmaciones de la versión anterior que siguen vigentes: los cuatro objetivos sin
fijar dependen de SIMBAD; no hay igualación de PSF; no hay suma de épocas;
`AladinViewer.tsx` es código muerto; el recorte está fijo en 6 arcmin; no hay
coordenadas en la URL; no se acepta formato sexagesimal.

---

## 3. Auditoría frente a cada requisito del desafío

Estados: **Cumple**, **Parcial**, **Falta**, **No verificable** (requiere datos
reales). Un punto solo pasa a Cumple con evidencia observada en la aplicación
desplegada.

### 3.1 Requisitos obligatorios

| ID | Requisito | Estado hoy | Qué falta | Cómo se ve "ganador" | Paquetes |
|---|---|---|---|---|---|
| R1 | Herramienta pública sin barreras | Parcial | El middleware exige sesión en `/time-explorer` si Supabase está configurado (`frontend/middleware.ts:17`); el backend responde 401 en `/analysis/*` con secreto configurado (`backend/app/auth.py:161-166`) | Todo el flujo funciona en una ventana privada; la sesión solo sirve para guardar en el diario | WP-04 |
| R2 | Entrada por RA y Dec | Parcial | Solo grados decimales (`frontend/components/SearchBar.tsx:25-28`); el formato del propio enunciado (`08h55m10.831s -7d14m42.53s`) se envía a SIMBAD como nombre | Acepta decimal, sexagesimal, nombre y la URL `?ra=&dec=` | WP-06, WP-11 |
| R3 | Imágenes reales de SPHEREx | **Parcial** (verificado en WP-05) | Los datos existen y son accesibles para los cinco objetivos, pero la URL de recorte de la app es rechazada por IRSA (HTTP 422) y el respaldo baja el detector completo; el mapeo de columnas no reconoce detector, banda ni fecha (§15.1) | Cada cuadro cita su producto (`obs_publisher_did`), colección, fecha y detector, y enlaza al archivo en IRSA | WP-07, WP-08, WP-33 |
| R4 | Secuencia como video | **Falta** | No hay ninguna imagen ligada a la reproducción | Reproductor fluido, precargado, con teclado, parpadeo A/B y exportación a video | WP-10, WP-11, WP-29 |
| R5 | Cambio perceptible rápido y sin ser experto | **Falta** | Escala por cuadro (SCI-01), cuadros sin alinear (SCI-02), seis interacciones manuales (UX-04) | Dos interacciones hasta ver la secuencia; el cambio se señala y se explica en lenguaje llano | WP-10, WP-11, WP-24, WP-32 |
| R6 | Funciona en los cinco objetivos | **Falta** en 3, Parcial en 1, No verificable en 1 | §4 | Cada objetivo tiene un enlace permanente que muestra su fenómeno en la demo | WP-06, WP-10, WP-23, WP-31 |

### 3.2 Consideraciones opcionales (diferenciadores)

| ID | Consideración | Estado hoy | Qué falta | Propuesta ganadora | Paquetes |
|---|---|---|---|---|---|
| C1 | Fácil de actualizar con nuevas entregas | Parcial | Colecciones fijas en `backend/app/config.py:29`; DOI y colección de sondeo en código | Las colecciones se descubren en IRSA; una insignia muestra la entrega usada; los resultados se recalculan al cambiar de entrega | WP-30 |
| C2 | Uso creativo de las 102 bandas; sumar por detector | Falta | No existe suma en ningún módulo | Cada cuadro del video es la suma ponderada de todas las exposiciones de un detector dentro de una visita | WP-10 (enmendado) |
| C3 | Espectros al vuelo ("extra kudos") | Falta | Lo actual es un perfil espacial, no un espectro (SCI-06) | Espectro de 102 canales del objetivo construido con su fotometría en cada exposición, más un "termómetro" de color | WP-26 |
| C4 | Sumar o restar épocas | Parcial | Solo resta de dos recortes, sin alineación de PSF | Resta con igualación de PSF, suma por visita y **búsqueda por apilado con desplazamiento** | WP-20, WP-25 |
| C5 | Campo de visión configurable | Falta | `size_arcmin: 6` fijo (`frontend/app/time-explorer/page.tsx:101`) | Selector de campo con el coste de transferencia mostrado; recomendación automática según el movimiento propio | WP-11, WP-24 |
| C6 | Superponer Gaia o WISE | Falta | `AladinViewer.tsx` sin importar | Posición prevista de cada estrella de Gaia en cada cuadro; época de referencia WISE/NEOWISE en el mismo color | WP-18, WP-24, WP-28 |
| C7 | Coordenadas en la URL | Falta | Ninguna ruta lee parámetros | URL completa del estado y modo incrustable con `<iframe>` | WP-11, WP-29 |
| C8 | Metadatos visibles, como banderas de contaminación | Parcial | `flagged_fraction` se calcula y no se muestra | Banderas por cuadro y en la posición del objetivo, con su significado | WP-19, WP-27 |
| C9 | Apoyarse en herramientas públicas | Parcial | Aladin sin usar; PyVO mal invocado | Astropy, reproject, photutils, astroquery (Gaia, IMCCE), Aladin Lite | WP-07, WP-18, WP-27 |

---

## 4. Auditoría por objetivo de prueba

**Verificado el 2026-11-11 (WP-05).** Movimientos propios y posiciones de SIMBAD
(espejo de Harvard); cobertura y bases temporales de la API SIA2 de IRSA. El
detalle y la procedencia están en §15. Los valores que vayan al código se toman
de la fuente con su procedencia (RC-8 del documento técnico).

| Objetivo | Fenómeno | Movimiento propio (SIMBAD) | Desplazamiento desde J2000 a 2026,0 | Mejor base temporal en un detector | Desplazamiento esperado en esa base |
|---|---|---|---|---|---|
| Barnard's Star | Movimiento | 10,39 arcsec/año | 4,5 arcmin | 402 días (D3/D6, 2025-08 a 2026-09) | 11,4 arcsec = **1,9 px** |
| WISE 0855 | Movimiento, objeto muy frío | 8,15 arcsec/año | 3,5 arcmin respecto de la posición J2000 de SIMBAD | 373 días (D2, 2025-05 a 2026-05) | 8,3 arcsec = **1,35 px** |
| Epsilon Indi B | Movimiento, binaria de enanas marrones | 4,68 arcsec/año | 2,0 arcmin | 526 días (D2, 2025-04 a 2026-10) | 6,7 arcsec = **1,1 px** |
| RW Aurigae | Brillo, T Tauri irregular | 0,02 arcsec/año | 0,01 arcmin | 373 días, 57 exposiciones por detector | — |
| R Draconis | Brillo, Mira con periodo de unos 245 días | 0,02 arcsec/año | 0,01 arcmin | 478 días, unas 600 exposiciones por detector | — |

Píxel de SPHEREx: 6,15 arcsec (columna `s_pixel_scale` de la respuesta de IRSA).
La paralaje de estos objetos (≤ 0,55 arcsec) es despreciable frente al píxel.

**Consecuencia de diseño:** ningún objetivo de movimiento se desplaza más de 2
píxeles con todos los datos disponibles. A simple vista, un parpadeo entre dos
cuadros sueltos casi no muestra movimiento. Para que R5 se cumpla hacen falta
tres cosas: apilar por época (sube la señal y permite medir un centroide con
precisión de décimas de píxel), marcar la trayectoria prevista y ampliar la
imagen sin suavizarla.

### 4.1 Estado y necesidades por objetivo

**Barnard's Star**
- Hoy: sin fijar; depende de SIMBAD; con la posición J2000 queda **fuera** del
  recorte de 3 arcmin de radio.
- Necesita: posición propagada a la fecha de cada cuadro (WP-06); recorte
  centrado en la posición propagada. Es brillante, así que su centroide se mide
  con precisión muy inferior a un píxel, y el desplazamiento de 1,9 píxeles se
  verá si se apila por época y se marca la trayectoria.
- Riesgo: saturación o persistencia en el detector. Pendiente de comprobar con
  las banderas `OVERFLOW` y `PERSIST` de sus propios píxeles (§15.6).
- Demo: "la estrella se desplaza sobre un fondo fijo de estrellas de Gaia", con
  la trayectoria prevista dibujada.

**WISE 0855**
- Hoy: fijado con las coordenadas del enunciado; etiquetado como J2000 por
  error; criterio de detección que pierde fuentes puntuales (SCI-08).
- Necesita: tratar la posición del enunciado como posición en una época de
  referencia a confirmar (WP-06); suma por visita en el detector de mayor
  longitud de onda (WP-10); búsqueda por apilado con desplazamiento (WP-25).
- **Hipótesis central de la demo:** al ser una enana marrón de unos 250 K, su
  emisión debería concentrarse en el extremo largo del rango de SPHEREx (en
  torno a 4,5 µm) y ser casi invisible por debajo de unos 3 µm. Estado tras
  WP-05: **parcialmente respaldada.** Al sumar 22 exposiciones del detector D6
  (4,4 a 5,0 µm) aparece un excedente a menos de 0,5 píxeles de la posición
  prevista, más brillante que el 97 % de las posiciones al azar, con un flujo
  compatible con su magnitud W2 de AllWISE. No es una detección confirmada
  (≈ 1,9σ empíricos con un solo ensayo a priori) y falta comprobar que no aparece
  en los detectores de longitud de onda corta (§15.5).
- Riesgo: está en el límite de detección incluso sumando. Si no se detecta, la
  herramienta lo dice y muestra el límite superior.

**Epsilon Indi B**
- Hoy: depende de SIMBAD; unos 2 arcmin descentrado.
- Necesita: propagación (WP-06). Las dos enanas marrones están separadas menos
  de un arcosegundo: **SPHEREx no puede separarlas** y la interfaz debe
  decirlo. Epsilon Indi A, muy brillante, está a 6,7 arcmin según SIMBAD
  (posiciones J2000 de A y B): no entra en un recorte de 6 arcmin, pero sí en
  campos de unos 14 arcmin o más y puede producir artefactos.
- Con 1,1 píxeles en 526 días el movimiento es marginal solo con SPHEREx. La
  época de referencia WISE/NEOWISE amplía la base a más de una década (IRSA
  devuelve 677 imágenes individuales NEOWISE-R de todas las bandas y 4 imágenes
  AllWISE en el campo de WISE 0855; en el de Epsilon Indi B falta comprobarlo) y
  se rotula como contexto de otra misión (WP-28).

**RW Aurigae**
- Hoy: sin escala compartida ni fotometría; la variabilidad es invisible.
- Necesita: modo brillo con escala física compartida, resta de luz zodiacal,
  fotometría diferencial frente a estrellas de comparación (WP-23).
- Es una binaria no resuelta por SPHEREx con disco; su variabilidad es
  irregular. La interfaz no debe prometer un periodo.

**R Draconis**
- Hoy: igual que RW Aurigae.
- Necesita: lo mismo. Con un periodo de unos 245 días, los 478 días de base
  cubren casi dos ciclos. **Cobertura verificada:** unas 600 exposiciones por
  detector (D1, D3, D4, D6) y 57 visitas en `spherex_qr2`, `spherex_qr2_deep` y
  `spherex_qr3_deep`. La curva de luz tendrá muchísimos puntos.
- Está a alta declinación, cerca del polo norte de la eclíptica, donde SPHEREx
  observa con más frecuencia: **confirmado** por la presencia de las colecciones
  `deep` (1259 filas en `qr2_deep` y 743 en `qr3_deep` para este campo).
- La app hoy lo trunca: el esquema limita a 200 filas por colección y la
  configuración a 500 (§15.2).

### 4.2 Criterio de aceptación de la demo por objetivo

| Objetivo | Se considera listo cuando, en la aplicación desplegada |
|---|---|
| Barnard's Star | El enlace permanente muestra al menos dos visitas alineadas y el desplazamiento medido coincide con el previsto dentro de su incertidumbre |
| WISE 0855 | Se muestra su detección en la suma de visitas con su significancia, o un límite superior explícito; la búsqueda por apilado recupera la dirección de movimiento sin conocerla de antemano, o declara que no hay señal suficiente |
| Epsilon Indi B | Secuencia centrada en la posición propagada, con el aviso de binaria no resuelta y de la estrella brillante cercana |
| RW Aurigae, R Draconis | Curva de luz por detector con barras de error y estrellas de comparación; la variación del objetivo supera la dispersión de las comparaciones, o la herramienta dice que no la supera |

---

## 5. Evaluación frente a los criterios del jurado

Criterios tomados de `docs/challenge.md` (confirmar la rúbrica vigente de 2026).

| Criterio | Hoy (0-10) | Motivo | Objetivo tras el plan | Qué lo mueve |
|---|---|---|---|---|
| Impacto | 3 | Un voluntario no puede ver un cambio | 8 | Flipbook directo, explicaciones, verificación de candidatos |
| Creatividad | 4 | Diario con hash; el resto es un visor convencional | 9 | Separación de color y tiempo; búsqueda por apilado; termómetro de color |
| Validez | 3 | Candidatos en (0, 0), escala por cuadro, "espectro" incorrecto | 8 | Resta de luz zodiacal, fotometría diferencial, pruebas con verdad inyectada |
| Relevancia | 5 | Apunta al problema correcto sin resolverlo | 9 | R1 a R6 y siete de las nueve consideraciones cubiertas |
| Presentación | 4 | No hay nada que se mueva en pantalla | 9 | Cinco enlaces permanentes, video exportado, guion de §13 |

Promedio simple actual: **3,8/10**. Es una estimación del equipo auditor, no del
jurado.

---

## 6. Contra qué compite el proyecto

| Herramienta | Qué ofrece | Qué no ofrece |
|---|---|---|
| SPHEREx Data Explorer (IRSA) | Visor de imágenes, recortes, espectrofotometría, catálogos | Secuencia temporal para público general; separación de color y tiempo; guía de verificación |
| Cuadernos de IRSA (recortes, PSF, descubrimiento de fuentes) | Recetas en Python para científicos | Interfaz web; flujo para no expertos |
| Backyard Worlds | Flipbooks de WISE para voluntarios, modelo probado de ciencia ciudadana | Datos de SPHEREx; información espectral |
| Equipos rivales del desafío | Previsiblemente, un reproductor de recortes de SPHEREx | Muy probablemente: alineación, escala compartida, luz zodiacal, comparación en el mismo color |

**Tesis de diferenciación:** no competir como visor de FITS (IRSA lo hace mejor).
Competir como **el Backyard Worlds de SPHEREx**: un flipbook honesto, que explica
qué es un cambio real y qué es un efecto del instrumento, y que guía a un
voluntario desde "veo algo" hasta "esto es un candidato verificado contra
catálogos".

---

## 7. Propuesta de producto para ganar

Siete pilares. Cada uno indica qué es, por qué gana, en qué se apoya
científicamente, cómo se valida y su riesgo.

### Pilar 1 · Flipbook honesto por visita y detector (núcleo; R4, R5, C2)

**Qué es.** Cada cuadro del video no es una exposición suelta, sino una
**visita**: todas las exposiciones del mismo detector que caen en el objetivo
dentro de una ventana corta de tiempo, sumadas con peso de varianza inversa,
tras restar la luz zodiacal y reproyectar a una rejilla común (norte arriba).

**Por qué gana.**
- Resuelve la tensión del propio enunciado: muchas exposiciones mezclan colores;
  una visita por detector tiene siempre la misma banda ancha. Así el video
  compara peras con peras.
- Cumple C2 de la forma que el enunciado sugiere ("sumar los datos de cada uno
  de los 6 detectores para mejorar señal/ruido").
- Hace visibles objetos débiles como WISE 0855.

**Base científica.**
- SPHEREx tiene seis detectores, cada uno cubre un tramo del rango de 0,75 a
  5 µm; cada píxel tiene su propia longitud de onda (documentación de IRSA y
  artículo del pipeline, arXiv:2511.15823).
- IRSA **no** resta la luz zodiacal en las imágenes; la entrega un modelo en la
  extensión ZODI (documentación de productos de IRSA). La luz zodiacal cambia
  con la geometría de cada época, así que sin restarla una comparación de
  brillo entre épocas no es válida.

**Validación.** Pruebas sintéticas de WP-10: escala compartida, alineación,
orientación, exclusión de detectores mezclados; y una prueba nueva: dos visitas
con la misma estrella y distinto fondo zodiacal producen el mismo flujo tras
la resta.

**Riesgo.** Definir "visita" depende de la cadencia real (hipótesis). WP-05
mide la distribución de tiempos entre exposiciones por objetivo y de ahí sale
la ventana.

### Pilar 2 · El movimiento se ve aunque sea menor que un píxel (Barnard, WISE 0855, Epsilon Indi B)

**Qué es.** Tres herramientas superpuestas al flipbook:

1. **Trayectoria prevista.** Para el objetivo y para cada estrella de Gaia del
   campo, su posición prevista en la fecha de cada cuadro. Lo que sigue su
   trayectoria es conocido; lo que se mueve sin trayectoria prevista es
   interesante.
2. **Búsqueda por apilado con desplazamiento ("modo Planeta X").** El usuario
   elige una dirección y una velocidad (o deja que la herramienta recorra una
   rejilla) y las visitas se suman desplazadas a lo largo de ese movimiento. Un
   objeto que se mueve así se concentra en un punto y destaca; las estrellas
   fijas se emborronan.
3. **Época de referencia.** Opcional y rotulada como otra misión: una imagen de
   WISE o NEOWISE en un color equivalente (3,4 o 4,6 µm) para ampliar la base
   temporal a más de una década.

**Por qué gana.** La búsqueda por apilado es la técnica real con la que se busca
el Planeta Nueve y objetos lejanos ("digital tracking" o "shift-and-stack";
por ejemplo, la búsqueda con WISE y NEOWISE, arXiv:1611.00015, o la de TESS,
arXiv:2010.13791). Ponerla en manos de un voluntario, con datos de SPHEREx y
explicada en lenguaje llano, conecta directamente con el título del desafío.
La demo puede mostrar que la herramienta **recupera a ciegas** la dirección de
movimiento de WISE 0855.

**Validación.**
- Prueba sintética: una fuente débil inyectada que se mueve 1 píxel por visita,
  invisible en cada cuadro (SNR 2 por cuadro), se recupera en la suma desplazada
  con SNR aproximadamente igual a 2 por raíz del número de visitas, y la
  velocidad recuperada coincide con la inyectada dentro de un píxel por periodo.
- Con datos reales: el movimiento recuperado de Barnard y WISE 0855 coincide con
  el del catálogo dentro de su incertidumbre (o se declara sin señal
  suficiente).

**Riesgo.** Con pocas visitas, la búsqueda puede no tener poder estadístico.
La herramienta debe mostrar el número de visitas y la significancia, y nunca
un "resultado" por debajo del umbral.

### Pilar 3 · El brillo es confiable (RW Aurigae, R Draconis)

**Qué es.**
- Fotometría de apertura del objetivo en cada visita, con resta de fondo en
  anillo y error tomado de la extensión VARIANCE.
- **Fotometría diferencial:** las mismas medidas sobre 5 a 10 estrellas de
  comparación del campo, elegidas en Gaia por brillo similar y sin variabilidad
  conocida. Se muestran juntas: si el objetivo cambia y las comparaciones no,
  el cambio es del objetivo; si todas cambian, es del instrumento o del fondo.
- **Corrección por color:** dentro de un detector, la longitud de onda efectiva
  en la posición del objetivo varía entre exposiciones. Se ajusta la forma del
  espectro del objetivo con todos los datos y se muestra la variabilidad como
  residuo respecto a esa forma, de modo que un cambio de color del instrumento
  no se confunda con un cambio de brillo del objeto.

**Por qué gana.** Es lo que haría un astrónomo antes de afirmar variabilidad, y
casi ningún visor público lo hace. Responde de forma directa a la pregunta que
hará un jurado especialista: "¿cómo sabéis que el cambio es real?".

**Validación.** Pruebas sintéticas de WP-23: una variable inyectada con
amplitud conocida se recupera dentro del error; una estrella constante con
variación sintética del fondo zodiacal sale constante tras la resta; una
variación común a todas las estrellas se cancela en la fotometría diferencial.

**Riesgo.** La corrección por color es la parte más nueva y menos probada. Si
no se valida a tiempo, se entrega la curva por detector sin ella y se rotula
"sin corrección de color".

### Pilar 4 · Espectro al vuelo y termómetro de color (C3)

**Qué es.**
- El espectro del objetivo se construye con su fotometría en **cada
  exposición**, situada en la longitud de onda que la tabla WCS-WAVE asigna a
  ese píxel (este es el método correcto para SPHEREx; el actual perfil por filas
  no lo es).
- Un **termómetro de color** compara el flujo en los detectores de longitud de
  onda corta y larga. Explicado al público: "los objetos fríos, como las enanas
  marrones o un hipotético Planeta X, casi no brillan en azul infrarrojo y sí en
  rojo infrarrojo".

**Por qué gana.** Es el "extra kudos" explícito del enunciado y convierte las
102 bandas en una herramienta de descubrimiento, no en un adorno. El termómetro
es una forma nueva y comprensible de usar el espectro para decidir si un
candidato merece atención.

**Validación.** Prueba sintética: con un mapa de longitud de onda y un espectro
inyectado conocidos, el espectro recuperado coincide dentro del 10 % y cada
punto cae dentro del ancho de su canal. Con datos reales: la forma general del
espectro de R Draconis o Barnard es coherente con su tipo espectral (comparación
cualitativa, rotulada como tal).

**Riesgo.** Sin corrección de apertura ni calibración absoluta, el espectro es
relativo. Se rotula "espectrofotometría relativa, sin corrección de apertura".

### Pilar 5 · Verificar como un científico (C8, credibilidad)

**Qué es.** Para cualquier fuente que el usuario marque, una lista de
comprobación automática y visible:

| Comprobación | Fuente | Resultado mostrado |
|---|---|---|
| ¿Es una estrella conocida de Gaia en su posición prevista? | Gaia DR3 por astroquery | Coincide o no, con la distancia |
| ¿Es un asteroide o cometa conocido en esa fecha? | IMCCE SkyBoT por `astroquery.imcce` (búsqueda por cono y época) | Nombre del objeto o ninguno |
| ¿Tiene banderas de calidad en esos píxeles? | Extensión FLAGS | Bits activos y su significado |
| ¿Aparece en al menos dos visitas? | Visitas | Número de visitas con detección |
| ¿Su movimiento es coherente entre visitas? | Ajuste lineal | Velocidad y error, o incoherente |
| ¿Tiene forma de fuente puntual? | Extensión PSF | Compatible o no |
| ¿Qué color tiene? | Pilar 4 | Posición en el termómetro |

El resultado es una **categoría**, nunca un descubrimiento: artefacto probable,
objeto conocido, candidato sin explicar. El informe de evidencia (WP-14) guarda
todas las comprobaciones.

**Por qué gana.** Protege la credibilidad del proyecto y enseña a los
voluntarios el método real. La comprobación de asteroides conocidos es
imprescindible: el campo de cualquier búsqueda de movimiento está lleno de
asteroides, y presentar uno como Planeta X arruinaría la demo.

**Validación.** Simulacros de Gaia y SkyBoT en las pruebas; con datos reales, un
asteroide conocido que cruce un campo se identifica por su nombre (si WP-05
encuentra uno).

### Pilar 6 · Compartir, incrustar y presentar (C7, presentación)

**Qué es.**
- La URL contiene todo el estado: objetivo, campo, modo, cuadro y detector.
- Modo incrustable (`?embed=1`) para usarlo en otros sitios, como pide C7.
- Exportación del flipbook a video WebM o GIF animado desde el navegador, con
  la fecha y el detector impresos en cada cuadro y la fuente de los datos.
- Enlace a cada producto original en IRSA.

**Por qué gana.** El jurado y el público se llevan el resultado. Un video corto
de Barnard moviéndose sobre estrellas de Gaia es material de presentación de
primera.

### Pilar 7 · Listo para la siguiente entrega de datos (C1)

**Qué es.** Las colecciones disponibles se descubren consultando IRSA, no se
fijan en código; la interfaz muestra qué entrega se usó; cambiar de entrega o de
versión de procesado invalida la caché y los resultados por clave.

**Por qué gana.** C1 lo pide explícitamente ("los datos de SPHEREx llegan
rápido"), y es barato una vez que existe `PROCESSING_VERSION` en las claves.

---

## 8. Lo que no se hace

Según "Fuera de foco" de `docs/challenge.md` y la regla final del encargo:

- No se añade infraestructura (Redis, DragonflyDB, colas, WebSockets) para este
  plan. Ninguno de los pilares la necesita a la escala del desafío.
- No se muestran visualizaciones decorativas en el flujo principal. La esfera
  celeste se conserva solo como mapa de cobertura (huellas observadas).
- No se clasifica automáticamente un objeto como descubrimiento. La herramienta
  asiste al ojo del usuario, no lo sustituye.
- No se rellenan huecos con datos sintéticos. Sin cobertura, se dice.
- No se compite como visor genérico de FITS.

---

## 9. Plan de implementación

Toda la implementación sigue la regla de cambio del documento técnico (§20):
aprobación por paquete, prueba primero, superficie de edición cerrada,
invariantes científicos y cuándo detenerse.

### 9.1 Fases y puertas

| Fase | Objetivo | Paquetes | Puerta para pasar a la siguiente |
|---|---|---|---|
| A | Seguridad y producción | WP-00, WP-01, WP-02, WP-03, WP-04 | El sitio desplegado muestra datos y el flujo no pide sesión |
| B0 | Conocer los datos | WP-05 (ampliado) | Tabla de cobertura y cadencia de los cinco objetivos; extensiones confirmadas. **Puede cambiar el diseño de todo lo demás** |
| B | Núcleo: el flipbook | WP-06, WP-07, WP-08, WP-09, WP-10 (enmendado), WP-11 | Los cinco enlaces permanentes reproducen una secuencia alineada |
| C | Ciencia que convence | WP-12, WP-23, WP-24, WP-14 | Curvas de luz con comparaciones; trayectorias previstas; ningún candidato en (0, 0) |
| D | Diferenciadores | WP-25, WP-26, WP-27, WP-28 | Búsqueda por apilado, espectro y verificación funcionando en al menos un objetivo cada uno |
| E | Presentación y robustez | WP-29, WP-30, WP-31, WP-32, WP-15 a WP-19, WP-21, WP-22 | Lista de §10 completa |

Si el tiempo no alcanza, el orden de recorte está en §12.

### 9.2 Enmiendas a paquetes del documento técnico

Estas enmiendas sustituyen el texto correspondiente de
`docs/auditoria-tecnica-arquitectonica.md` §21. Quien implemente aplica el
paquete original con estos cambios.

**WP-05 (ampliado): verificar los supuestos contra datos reales.** Además de lo
ya listado, registrar para cada objetivo:
1. Fechas de todas las exposiciones que lo contienen, por detector, y la
   distribución de intervalos entre ellas (para definir "visita").
2. Longitud de onda en la posición del objetivo para cada exposición, leída de
   WCS-WAVE.
3. Magnitud del modelo ZODI en la posición del objetivo por exposición.
4. Contenido de los encabezados de la extensión PSF y la errata publicada por
   IRSA sobre sus zonas.
5. Si WISE 0855 aparece en una suma simple de las exposiciones del detector de
   mayor longitud de onda (comprobación rápida de la hipótesis de §4.1).
6. Disponibilidad y forma de acceso de imágenes WISE/NEOWISE en IRSA para los
   cinco campos (para WP-28).

**WP-10 (enmendado): motor de secuencia.**
- El cuadro de la secuencia es una **visita**: exposiciones del mismo detector
  dentro de la ventana definida en WP-05, sumadas con peso de varianza inversa
  sobre la rejilla común. Se conserva la opción de ver exposiciones sueltas.
- Antes de sumar o escalar, se resta a cada exposición su modelo ZODI. El
  resultado declara `zodi_subtracted: true`.
- El centro del recorte de cada visita es la posición del objetivo propagada a
  la fecha media de esa visita, pero la rejilla común se fija en el cielo (no se
  mueve con el objetivo), de modo que el movimiento se vea.
- Cada cuadro informa `n_exposures`, `wavelength_range_um` y
  `effective_wavelength_um` en la posición del objetivo.
- Criterios de aceptación adicionales:
  1. Dos exposiciones con la misma estrella y distinto nivel de ZODI dan el
     mismo flujo de estrella tras la resta, con error menor que el 5 %.
  2. La SNR de una fuente estática en una visita de N exposiciones crece como
     raíz de N con error menor que el 15 %.
  3. Una visita nunca mezcla detectores.

**WP-13: sustituido por WP-26.** Se conserva solo su parte mínima (acceso por
`EXTNAME` y dejar de llamar espectro al perfil espacial), que se hace dentro de
WP-26.

**WP-18 (enmendado): Aladin.** Además de las capas de Gaia y WISE, Aladin se
sincroniza con el cuadro actual del flipbook (misma fecha) y muestra las
posiciones de Gaia propagadas a esa fecha (las calcula WP-24).

**WP-20 (enmendado).** Queda solo la igualación de PSF antes de la resta. La
suma por visita pasa a WP-10 y la búsqueda por apilado a WP-25.

### 9.3 Paquetes nuevos

Formato idéntico al del documento técnico. "Verificación independiente" indica
validez científica, contrato nuevo o servicio externo nuevo.

#### WP-23 · Fotometría diferencial y curva de luz

- **Pilar:** 3. **Requisitos:** R5, R6 (RW Aurigae, R Draconis).
  **Depende de:** WP-10 enmendado. **Tamaño:** M. **Verificación
  independiente:** sí.
- **Servicio externo nuevo:** Gaia DR3 mediante `astroquery.gaia` (ya incluido
  en astroquery; sin dependencia nueva). Plazo total y caché por campo.
- **Superficie de edición:** `backend/app/services/photometry.py` (nuevo),
  `backend/app/services/catalogs.py` (nuevo),
  `backend/app/services/sequence.py`, `backend/app/schemas.py`,
  `frontend/components/LightCurve.tsx` (nuevo),
  `frontend/app/time-explorer/page.tsx`,
  `backend/tests/test_photometry_synthetic.py` (nuevo),
  `docs/api-contract.md`.
- **Cambio:**
  1. Fotometría de apertura por visita en la posición propagada del objetivo:
     radio en función del ancho de la PSF, anillo de fondo, error desde
     VARIANCE, fracción de píxeles con bandera.
  2. Selección de 5 a 10 estrellas de comparación en Gaia: brillo similar,
     aisladas, dentro del campo y sin bandera de variabilidad en Gaia.
  3. Curva relativa: flujo del objetivo dividido por la mediana de las
     comparaciones, normalizada; dispersión de las comparaciones mostrada como
     banda de referencia.
  4. Una curva por detector. Nunca se mezclan detectores en una curva.
  5. Corrección por color opcional, rotulada; si no está validada, desactivada.
- **Criterios de aceptación (sintéticos):**
  1. Variable inyectada con amplitud del 30 %: amplitud recuperada dentro del
     error estimado.
  2. Estrella constante con un 20 % de variación común inyectada en todo el
     cuadro: curva relativa plana dentro del error.
  3. Estrella constante con fondo ZODI variable: curva plana tras la resta.
  4. Píxel con bandera en la apertura: el punto se marca y se excluye del ajuste.
  5. Sin estrellas de comparación válidas: la curva se muestra como absoluta y
     se rotula.
- **Fuera de alcance:** periodos, clasificación de variables.

#### WP-24 · Trayectorias previstas y estrellas de referencia

- **Pilar:** 2. **Requisitos:** R5, R6 (movimiento), C5, C6. **Depende de:**
  WP-06, WP-10. **Tamaño:** M.
- **Servicio externo nuevo:** Gaia DR3, compartido con WP-23.
- **Superficie de edición:** `backend/app/services/catalogs.py`,
  `backend/app/routers/sequences.py`, `backend/app/schemas.py`,
  `frontend/components/SequencePlayer.tsx`,
  `backend/tests/test_catalogs.py` (nuevo), `docs/api-contract.md`.
- **Cambio:**
  1. Para cada visita, posición prevista del objetivo y de las estrellas de Gaia
     del campo hasta una magnitud límite, propagadas con
     `SkyCoord.apply_space_motion` a la fecha media de la visita y convertidas a
     píxeles de la rejilla común.
  2. Superposición en el reproductor, activable: marcas de Gaia, trayectoria del
     objetivo entre la primera y la última visita, y círculo de incertidumbre.
  3. Desplazamiento medido del objetivo frente al previsto, si WP-12 lo mide.
  4. Recomendación de campo de visión: si el desplazamiento previsto en la
     ventana supera la mitad del campo, se sugiere uno mayor.
- **Criterios de aceptación:**
  1. Una estrella sintética con 10 000 mas/año en declinación aparece 100 arcsec
     más al norte en una visita 10 años posterior, con error menor que 0,1
     arcsec.
  2. Las marcas de Gaia de un campo sintético coinciden con las fuentes
     inyectadas dentro de un píxel.
  3. Con Gaia inaccesible, la secuencia se muestra igual y la capa queda
     desactivada con un aviso.

#### WP-25 · Búsqueda por apilado con desplazamiento ("modo Planeta X")

- **Pilar:** 2. **Requisitos:** C4, R6 (WISE 0855). **Depende de:** WP-10,
  WP-12. **Tamaño:** L. **Verificación independiente:** sí.
- **Superficie de edición:** `backend/app/services/shift_stack.py` (nuevo),
  `backend/app/routers/sequences.py`, `backend/app/schemas.py`,
  `frontend/components/ShiftStackPanel.tsx` (nuevo),
  `backend/tests/test_shift_stack_synthetic.py` (nuevo),
  `docs/api-contract.md`.
- **Cambio:**
  1. Entrada: una secuencia de visitas del mismo detector, una rejilla de
     velocidades (dirección y módulo, en arcsec/año) con un máximo de
     combinaciones configurable.
  2. Para cada velocidad, desplazar cada visita según su fecha y sumar con peso
     de varianza inversa; medir la significancia del pico en la posición
     esperada.
  3. Salida: mapa de significancia sobre la rejilla de velocidades, la mejor
     velocidad, su significancia corregida por el número de pruebas (penalización
     por búsqueda múltiple), y la imagen apilada correspondiente.
  4. Modo manual en la interfaz: el usuario arrastra un vector y ve la suma en
     tiempo casi real (sobre cuadros ya calculados en el navegador o con
     llamadas cacheadas por velocidad).
  5. Se ejecuta como job con progreso y bajo el semáforo de WP-09.
- **Criterios de aceptación (sintéticos):**
  1. Fuente inyectada con SNR 2 por visita y 1 píxel por visita en 8 visitas:
     velocidad recuperada dentro de 0,5 píxeles por intervalo y significancia
     del apilado de al menos 5.
  2. Solo ruido: la significancia corregida de la mejor velocidad supera el
     umbral en el 2 % de los casos como máximo.
  3. Una estrella fija brillante no produce un pico en velocidades distintas de
     cero (se enmascara o se resta antes).
  4. Con menos de tres visitas, el job termina con una limitación explícita y
     sin resultado.
- **Fuera de alcance:** órbitas no lineales (para objetos lejanos, el
  movimiento lineal en 1,5 años es una aproximación aceptable que se declara).

#### WP-26 · Espectro al vuelo y termómetro de color

- **Pilar:** 4. **Requisitos:** C3. **Depende de:** WP-05, WP-10, WP-23.
  **Tamaño:** L. **Verificación independiente:** sí.
- **Superficie de edición:** `backend/app/services/spectral.py`,
  `backend/app/services/fits_processing.py`,
  `backend/app/services/photometry.py`, `backend/app/routers/analysis.py`,
  `frontend/app/spectral-lab/page.tsx`,
  `backend/tests/test_spectral_synthetic.py` (nuevo),
  `docs/api-contract.md`.
- **Cambio:**
  1. Acceso a todas las extensiones por `EXTNAME` (corrige SCI-06).
  2. Para cada exposición del objetivo: fotometría de apertura (WP-23) tras
     restar ZODI, y longitud de onda y ancho de banda en el píxel del objetivo
     desde WCS-WAVE.
  3. Espectro: flujo frente a longitud de onda, con error, coloreado por fecha
     para que la variabilidad se distinga de la forma espectral.
  4. Termómetro de color: razón entre el flujo medio en el detector de mayor
     longitud de onda y en uno de menor, con su error y una explicación en
     lenguaje llano; referencias cualitativas rotuladas (estrella normal frente
     a objeto frío) que no se presentan como calibración.
  5. Rotulado fijo: "espectrofotometría relativa, sin corrección de apertura".
- **Criterios de aceptación:**
  1. FITS con extensiones en otro orden: se procesa igual.
  2. Espectro inyectado conocido sobre un mapa de longitud de onda sintético:
     recuperado dentro del 10 % y cada punto dentro de su canal.
  3. Objeto sintético frío (flujo solo en el detector largo) frente a uno con
     espectro plano: el termómetro los separa con al menos 3 sigma.
  4. Ningún texto llama espectro al perfil espacial antiguo.

#### WP-27 · Verificación de candidatos

- **Pilar:** 5. **Requisitos:** C8, credibilidad. **Depende de:** WP-12, WP-24,
  WP-26. **Tamaño:** M. **Verificación independiente:** sí.
- **Servicio externo nuevo:** IMCCE SkyBoT mediante `astroquery.imcce` (ya
  incluido en astroquery). Plazo total y caché por campo y época.
- **Superficie de edición:** `backend/app/services/vetting.py` (nuevo),
  `backend/app/services/catalogs.py`, `backend/app/routers/analysis.py`,
  `backend/app/schemas.py`, `frontend/components/VettingPanel.tsx` (nuevo),
  `backend/tests/test_vetting.py` (nuevo), `docs/api-contract.md`.
- **Cambio:** las siete comprobaciones de §7, pilar 5, ejecutadas sobre una
  fuente marcada; resultado en una de tres categorías (artefacto probable,
  objeto conocido, candidato sin explicar), cada comprobación con su evidencia;
  la categoría y las comprobaciones entran en el informe de evidencia.
- **Criterios de aceptación (con simulacros):**
  1. Un asteroide devuelto por SkyBoT en la posición y fecha de la fuente da
     "objeto conocido" con su nombre.
  2. Una fuente que coincide con una estrella de Gaia en su posición prevista da
     "objeto conocido".
  3. Una fuente en píxeles con bandera y en una sola visita da "artefacto
     probable".
  4. Con SkyBoT o Gaia inaccesibles, la comprobación figura como "no
     comprobada" y la categoría nunca pasa a "candidato sin explicar" por
     omisión.
  5. Ningún texto usa "descubrimiento".

#### WP-28 · Época de referencia WISE/NEOWISE

- **Pilar:** 2. **Requisitos:** C6, R6 (Epsilon Indi B). **Depende de:** WP-05
  (acceso confirmado), WP-10. **Decisión:** D14. **Tamaño:** M.
- **Superficie de edición:** `backend/app/services/reference_epoch.py` (nuevo),
  `backend/app/routers/sequences.py`, `backend/app/config.py`,
  `frontend/components/SequencePlayer.tsx`,
  `backend/tests/test_reference_epoch.py` (nuevo), `docs/api-contract.md`.
- **Cambio:** obtener de IRSA una imagen WISE o NEOWISE del campo en la banda más
  cercana a la del detector elegido (W1 3,4 µm o W2 4,6 µm), reproyectarla a la
  rejilla común y ofrecerla como cuadro de referencia, activable, con un rótulo
  permanente "otra misión, otra resolución". Nunca se resta de SPHEREx sin
  igualar PSF.
- **Criterios de aceptación:**
  1. El cuadro de referencia aparece separado visualmente y con su rótulo.
  2. Las estrellas de Gaia propagadas a la fecha WISE coinciden con las fuentes
     de la imagen WISE dentro de un píxel de SPHEREx.
  3. Desactivado por defecto si D14 así lo decide.

#### WP-29 · Compartir, incrustar y exportar

- **Pilar:** 6. **Requisitos:** C7, presentación. **Depende de:** WP-11.
  **Tamaño:** S.
- **Superficie de edición:** `frontend/components/SequencePlayer.tsx`,
  `frontend/app/time-explorer/page.tsx`, `frontend/next.config.js` (solo la
  cabecera que permite el modo incrustado en esa ruta).
- **Cambio:** botón "Copiar enlace" con el estado completo; `?embed=1` muestra
  solo el reproductor y un enlace a la herramienta; exportación a WebM con
  `MediaRecorder` sobre un lienzo y respaldo a una secuencia de PNG; cada cuadro
  exportado lleva fecha, detector y "Datos: NASA/IPAC IRSA, SPHEREx".
- **Criterios de aceptación:** la URL copiada reproduce el mismo estado en otra
  ventana; el modo incrustado funciona dentro de un `<iframe>` de otro origen;
  el video exportado tiene tantos cuadros como la secuencia y los rótulos
  legibles.
- **Nota:** la cabecera `X-Frame-Options: DENY` de WP-16 se exceptúa solo para
  el modo incrustado, con `Content-Security-Policy: frame-ancestors *` en esa
  ruta.

#### WP-30 · Entregas de datos descubiertas, no fijadas

- **Pilar:** 7. **Requisitos:** C1. **Depende de:** WP-07. **Tamaño:** S.
- **Superficie de edición:** `backend/app/services/sia2_gateway.py`,
  `backend/app/config.py`, `backend/app/services/evidence.py`,
  `frontend/components/StatusBanner.tsx`,
  `backend/tests/test_sia2.py`.
- **Cambio:** al arrancar y cada 24 horas, consultar a IRSA qué colecciones
  SPHEREx existen y elegir la más reciente de cada tipo, con la lista
  configurada como respaldo; mostrar la entrega usada; los DOI se derivan de la
  colección elegida mediante una tabla de datos, no del código.
- **Criterios de aceptación:** con una respuesta simulada que añade una
  colección nueva, la siguiente búsqueda la usa sin cambiar código; con IRSA
  inaccesible, se usa la lista configurada y se avisa.

#### WP-31 · Demo a prueba de escenario

- **Requisitos:** R6, presentación. **Depende de:** WP-10, WP-11. **Tamaño:** S.
- **Superficie de edición:** `backend/app/routers/system.py`,
  `backend/scripts/warm_targets.py` (nuevo), `docs/demo.md` (nuevo).
- **Cambio:**
  1. Script que prepara y deja en caché las secuencias de los cinco objetivos
     (datos reales, con su fecha de consulta).
  2. Comprobación previa a la demo: los cinco enlaces permanentes responden y
     muestran al menos dos visitas.
  3. Si IRSA no responde en el escenario, la aplicación sirve los resultados
     reales ya calculados rotulados "consultado el <fecha>, en caché". Nunca
     datos sintéticos.
  4. `docs/demo.md` con los cinco enlaces, el guion de §13 y qué hacer si algo
     falla.
- **Criterios de aceptación:** con la red del backend hacia IRSA cortada, los
  cinco enlaces siguen mostrando su secuencia con el rótulo de caché.

#### WP-32 · Guía para no expertos

- **Requisitos:** R5, impacto. **Depende de:** WP-11, WP-23, WP-24.
  **Tamaño:** S.
- **Superficie de edición:** `frontend/components/Tutorial.tsx`,
  `frontend/components/Explainer.tsx` (nuevo),
  `frontend/app/page.tsx`, `frontend/app/time-explorer/page.tsx`.
- **Cambio:**
  1. Portada con los cinco objetivos como tarjetas ("Mira cómo se mueve la
     estrella de Barnard", "Mira cómo late R Draconis"), cada una abre su enlace
     permanente.
  2. Panel "¿Qué estoy viendo?" junto al reproductor: qué es cada cuadro, por
     qué cambia de color de un detector a otro, qué es la luz zodiacal, qué
     significa la escala.
  3. Cada resultado con su etiqueta: observación, cálculo, candidato.
  4. Glosario breve en el idioma elegido en D4.
- **Criterios de aceptación:** una persona sin formación en astronomía, sin
  ayuda, llega al video de un objetivo y explica qué cambió (prueba con al menos
  tres personas, resultados anotados en `docs/demo.md`).

### 9.4 Grafo de dependencias

```mermaid
flowchart LR
    A[Fase A: WP-00 a WP-04] --> W05[WP-05 datos reales]
    W05 --> W06[WP-06 objetivos]
    W05 --> W07[WP-07 gateway]
    W07 --> W08[WP-08 recortes]
    W08 --> W09[WP-09 jobs]
    W06 --> W10[WP-10 visitas y ZODI]
    W09 --> W10
    W10 --> W11[WP-11 reproductor]
    W10 --> W12[WP-12 diferencial]
    W10 --> W23[WP-23 curva de luz]
    W10 --> W24[WP-24 trayectorias]
    W12 --> W25[WP-25 modo Planeta X]
    W23 --> W26[WP-26 espectro]
    W24 --> W27[WP-27 verificacion]
    W26 --> W27
    W12 --> W27
    W10 --> W28[WP-28 referencia WISE]
    W11 --> W29[WP-29 compartir]
    W11 --> W31[WP-31 demo]
    W11 --> W32[WP-32 guia]
    W07 --> W30[WP-30 entregas]
```

---

## 10. Definición de listo para el desafío

El proyecto está listo para presentarse cuando todo esto se ha observado en la
aplicación desplegada, no en local:

- [ ] Una ventana privada abre la herramienta y llega al video sin iniciar sesión (R1).
- [ ] Se aceptan coordenadas decimales, sexagesimales y la URL `?ra=&dec=` (R2, C7).
- [ ] Cada cuadro cita su producto SPHEREx en IRSA (R3).
- [ ] El reproductor muestra visitas alineadas, con fecha, detector y escala (R4).
- [ ] Desde la portada hasta el video hay como máximo dos interacciones (R5).
- [ ] Los cinco enlaces permanentes cumplen su criterio de §4.2 (R6).
- [ ] La luz zodiacal se resta y se dice (validez).
- [ ] Las curvas de luz muestran estrellas de comparación (validez).
- [ ] Ningún candidato se guarda en (0, 0) y ningún texto dice "descubrimiento".
- [ ] La suite incluye pruebas sintéticas con verdad inyectada para alineación, escala, fotometría, apilado y espectro, y todas pasan.
- [ ] La matriz "Estado de cumplimiento" de `docs/challenge.md` está actualizada con evidencia.
- [ ] `docs/demo.md` existe y la demo se ensayó con la red hacia IRSA cortada.

---

## 11. Demo y relato

Objeto de apertura: **R Draconis o Barnard's Star**, el que WP-05 muestre con
más visitas. Cierre: **WISE 0855** como "así se buscaría un Planeta X".

---

## 12. Riesgos, decisiones y orden de recorte

### 12.1 Decisiones nuevas

Se suman a D1 a D11 del documento técnico.

| ID | Decisión | Recomendación | Bloquea |
|---|---|---|---|
| D12 | Fecha límite real y etapa del concurso | Confirmarla antes de planificar; condiciona el orden de recorte | Todo el plan |
| D13 | Autorizar Gaia DR3 e IMCCE SkyBoT como servicios externos | Sí; están en astroquery y son la forma estándar de verificar | WP-23, WP-24, WP-27 |
| D14 | Mostrar WISE/NEOWISE como época de referencia | Sí, desactivada por defecto y rotulada; el núcleo sigue siendo SPHEREx | WP-28 |
| D15 | Ventana que define una "visita" | Decidir con los datos de WP-05 | WP-10 |
| D16 | Magnitud límite de las estrellas de Gaia superpuestas | Decidir según densidad del campo; mostrar como máximo unas 200 | WP-24 |

### 12.2 Riesgos principales

| Riesgo | Probabilidad | Efecto | Mitigación |
|---|---|---|---|
| Pocas visitas por objetivo | Media | El video tiene dos o tres cuadros | Comunicarlo; combinar con la época de referencia; elegir para la demo el objetivo con más visitas |
| WISE 0855 no se detecta ni sumando | Media | Se pierde la historia de cierre | Mostrar el límite superior; usar Barnard en el modo Planeta X como prueba de método |
| Los datos no tienen el formato asumido | Media | Retrabajo en el motor | WP-05 va antes de todo el núcleo |
| IRSA lento o caído en la demo | Media | Demo rota | WP-31 |
| La corrección por color no se valida a tiempo | Alta | Pilar 3 incompleto | Entregar la curva por detector sin ella, rotulada |
| Asteroides presentados como candidatos | Alta sin WP-27 | Pérdida de credibilidad | WP-27 antes de mostrar candidatos |

### 12.3 Orden de recorte si falta tiempo

Se recorta desde el final. Lo que está por encima de la línea no se recorta.

1. Fase A completa.
2. WP-05, WP-06, WP-07, WP-08, WP-09.
3. WP-10 enmendado y WP-11: **el flipbook**.
4. WP-23: curva de luz (sin corrección de color).
5. WP-24: trayectorias previstas.
6. WP-31: demo a prueba de escenario.

**Línea de mínimo viable para competir.**

7. WP-27: verificación (como mínimo, Gaia y SkyBoT).
8. WP-25: modo Planeta X.
9. WP-26: espectro y termómetro.
10. WP-29: compartir y exportar.
11. WP-32, WP-30, WP-28.
12. WP-12, WP-14 a WP-22 restantes del documento técnico.

---

## 13. Guion de presentación (cuatro minutos)

| Tiempo | Qué se muestra | Qué se dice |
|---|---|---|
| 0:00-0:30 | Portada con los cinco objetivos | "SPHEREx fotografía todo el cielo cada seis meses en 102 colores. Nadie puede revisarlo a mano. Esta herramienta deja que cualquiera lo haga." |
| 0:30-1:20 | Barnard's Star, flipbook con estrellas de Gaia | "Cada cuadro es una visita real de SPHEREx, alineada. La estrella se mueve sobre un fondo fijo, justo por donde el catálogo predice." |
| 1:20-2:10 | R Draconis, curva de luz con comparaciones | "Esta estrella cambia de brillo. ¿Cómo sabemos que es ella y no el instrumento? Comparamos con estrellas vecinas: ellas no cambian. Y restamos la luz del polvo del Sistema Solar, que sí cambia." |
| 2:10-3:10 | WISE 0855 en el modo Planeta X y el termómetro de color | "Este objeto es casi invisible en cada imagen. Sumando las visitas a lo largo del movimiento aparece. Es frío: solo brilla en el infrarrojo largo. Así se buscaría un Planeta X." |
| 3:10-3:40 | Verificación y evidencia | "Antes de llamar candidato a algo, comprobamos catálogos de estrellas y de asteroides, y guardamos todo con un hash verificable." |
| 3:40-4:00 | Enlace y video exportado | "Cada resultado es un enlace que cualquiera puede abrir, incrustar o verificar." |

No afirmar en la demo nada que no esté marcado como cumplido en §10.

---

## 14. Fuentes

Documentación oficial y artículos consultados el 2026-11-11:

- IRSA, capacidades de recorte de SPHEREx (orden de extensiones IMAGE, FLAGS,
  VARIANCE, ZODI, PSF, WCS-WAVE en los recortes):
  https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html
- IRSA, productos de datos de SPHEREx (IMAGE en MJy/sr de 2040 por 2040; PSF
  como cubo de 121 planos; sin resta de luz zodiacal):
  https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products
- IRSA, acceso a datos de SPHEREx:
  https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access
- IRSA, tutorial de recortes de imágenes espectrales:
  https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts
- IRSA, tutorial de PSF: https://caltech-ipac.github.io/irsa-tutorials/spherex-psf/
- IRSA, demostración de herramienta de descubrimiento de fuentes:
  https://caltech-ipac.github.io/irsa-tutorials/spherex-source-discovery-tool-demo
- IRSA, resumen de entregas rápidas (QR):
  https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html
- The SPHEREx Image and Spectrophotometry Processing Pipeline, arXiv:2511.15823.
- Searching for Planet Nine with Coadded WISE and NEOWISE-Reactivation Images,
  arXiv:1611.00015.
- A Targeted Shift-Stacking Search for Planet Nine with TESS, arXiv:2010.13791.
- IMCCE SkyBoT, búsqueda por cono: https://ssp.imcce.fr/webservices/skybot/
- astroquery, módulo IMCCE:
  https://astroquery.readthedocs.io/en/stable/imcce/imcce.html

Los periodos y las magnitudes de §4 que no aparecen en §15 siguen siendo
aproximaciones de conocimiento general; deben confirmarse antes de usarse en
código o en la demo (RC-8). Los movimientos propios, las posiciones y la
magnitud W2 de WISE 0855 sí están verificados (§15).

---

## 15. Resultados de WP-05: datos reales de SPHEREx (2026-11-11)

Este es el primer contacto del proyecto con los datos reales. Cambia varias
cosas del plan; §15.7 dice cuáles.

### 15.0 Qué se hizo y qué límites tiene

- Se consultó la API SIA2 y el TAP de IRSA, SIMBAD (espejo de Harvard) y AllWISE.
  Todo son consultas de lectura sobre datos públicos, sin credenciales.
- Se descargaron 29 recortes reales: 22 de WISE 0855 (detector D6) para el
  experimento de §15.5, uno de cada uno de los otros cuatro objetivos y tres de
  prueba.
- Se ejecutaron las funciones de la propia app (`summarize`, `render_preview`,
  `TemporalAnalysisEngine.compare`, `SpectralAnalysisEngine.extract`) sobre esos
  recortes.
- Los fixtures reales y los datos con su procedencia están en
  `backend/tests/fixtures/real/` (1,5 MB; ver su README).
- **El servicio de recortes de IRSA limita las peticiones:** respondió
  `503 "Server busy, retry later."` en ráfagas. La descarga de las 43
  exposiciones D6 de WISE 0855 se detuvo en 22 por esa causa.
- Los scripts de exploración no se versionaron; los métodos están descritos lo
  bastante como para reproducirlos.

### 15.1 Hallazgos

Los identificadores DAT- son nuevos. Los paquetes enmendados están en §15.7.

| ID | Prio. | Hallazgo (observado) | Impacto | Paquete |
|---|---|---|---|---|
| DAT-01 | P0 | IRSA responde **HTTP 422** a la URL de recorte que construye la app (`?POS=CIRCLE ...&RESPONSEFORMAT=application/fits`): `Either center or both ra and dec must be provided`. La sintaxis válida es `?center=RA,Dec&size=<grados>` (acepta también `6arcmin`) | El primer intento siempre falla y `cutouts.py:44` baja el archivo completo (~70 MB, detector de 3,5°). Lo que la app llama "recorte" no lo es | WP-08 |
| DAT-02 | P0 | La respuesta SIA2 **no tiene** las columnas `detector`, `band` ni `date_obs`. Trae `energy_bandpassname` (`SPHEREx-D1`..`D6`), `em_min`/`em_max` (metros) y `t_min`/`t_max` (MJD) | Detector, banda y fecha quedan vacíos; la guarda "nunca se mezclan detectores" no actúa | WP-07 |
| DAT-03 | P0 | `obs_id` **no identifica un producto**: una exposición tiene hasta 6 imágenes (una por detector) con el mismo `obs_id`. En WISE 0855: 298 filas, 151 `obs_id`. El producto se identifica por `obs_publisher_did` (`.../D1`) | La clave `(obs_id, collection)` de la base mezcla productos: se guarda solo el primer `access_url` y un recorte puede bajar un detector distinto del mostrado | WP-07 |
| DAT-04 | P0 | Los motores de la app **fallan con productos reales**: `WCS(dict(header))` lanza `ValueError` por un comentario de la cabecera; el espectral lee `hdul[5]` (es la PSF, no `WCS-WAVE`) y devuelve 51 "muestras" sin longitud de onda; el temporal lanza `IncompatibleError` (recortes de 59×59 y 58×58) | Los análisis diferencial y espectral no producen resultados válidos con datos reales | WP-33 |
| DAT-05 | P0 | `FLAGS == 0` descarta casi todo: el bit 21 `SOURCE` ("fuente conocida") está activo en el 30 % al 100 % de los píxeles del recorte. La función `summarize` de la app da **0 % de píxeles válidos en Barnard y R Draconis**, 22 % en Epsilon Indi B y 32 % en RW Aurigae | Se enmascaran las propias estrellas, incluido el objetivo | WP-33 |
| DAT-06 | P1 | La luz zodiacal es el 70 % al 84 % del fondo en 4 de los 5 campos y no está restada de `IMAGE` (documentación oficial) | Comparar brillo entre épocas sin restarla no es válido | WP-10 |
| DAT-07 | P1 | `WCS-WAVE` es una rejilla 9×9 de pares (longitud de onda, ancho de banda) en coordenadas de detector completo. **La longitud de onda cambia con la fila del detector**: en D6, de 5,02 µm (fila 1) a 4,41 µm (fila 2040) | Una exposición ve el objetivo a un color distinto según dónde caiga; "misma banda" exige comparar la longitud de onda en el píxel | WP-10, WP-26 |
| DAT-08 | P1 | QR2 y QR3 son **periodos consecutivos**, no versiones: QR2 llega al 2026-07-20 y QR3 al 2026-10-05. Existen además `_deep` y `_cal`. R Draconis suma 570 + 1259 + 743 filas y la app limita a 200 o 500 por colección | Resultados truncados en el objetivo con más datos | WP-07, WP-30 |
| DAT-09 | P1 | El servicio de recortes de IRSA devuelve `503` en ráfagas; las descargas tardan de 6 a 15 s cada una | Una secuencia de 12 cuadros tarda minutos; hace falta caché, ritmo y reintentos con espera | WP-08, WP-09 |
| DAT-10 | P2 | El CSV de IRSA está mal formado en `cloud_access` (JSON sin entrecomillar): toda fila trae campos de más | Sin efecto en las columnas usadas, pero el analizador debe tolerarlo | WP-07 |
| DAT-11 | P2 | SIA2 no distingue una colección inexistente de una sin cobertura (ambas devuelven una tabla vacía de 641 bytes) | No se puede validar la configuración con SIA2; el TAP (`spherex.obscore`) sí lista las colecciones | WP-30 |
| DAT-12 | P2 | Cada recorte lleva el cubo de PSF completo (121 planos): 4,9 de sus 5,1 MB | 12 cuadros son unos 60 MB de transferencia | WP-08 |
| DAT-13 | P2 | La versión del procesado varía entre exposiciones: cabecera `VERSION` `6.4+psffix1` y `6.5.4+psffix1`; las rutas llevan `l2b-v20` y `l2b-v24` | `PROCESSING_VERSION` debe incluir la versión de los datos | WP-10 |
| DAT-14 | P2 | La posición de WISE 0855 del enunciado coincide con AllWISE (`J085510.74-071442.5`, 133,79476, -7,24515): es de la época WISE (~2010), no J2000. SIMBAD la da en J2000 a 133,81891 | Confirma SCI-03: sin propagar por movimiento propio la posición no sirve | WP-06 |

### 15.2 Cobertura por objetivo

Posición propagada a 2026,0 con el movimiento propio de SIMBAD; cono de 0,05°
(las imágenes miden 3,5°, así que el radio solo decide qué huellas se
intersecan). Filas = productos; exposiciones = `obs_id` distintos.

| Objetivo | `qr2` | `qr3` | `qr2_deep` | `qr3_deep` | Rango de fechas (todas) |
|---|---|---|---|---|---|
| Barnard's Star | 258 / 130 exp. | 129 / 65 exp. | 0 | 0 | 2025-08-15 a 2026-09-22 |
| Epsilon Indi B | 350 / 189 exp. | 120 / 60 exp. | 0 | 0 | 2025-04-24 a 2026-10-02 |
| WISE 0855 | 261 / 133 exp. | 0 | 0 | 0 | 2025-05-05 a 2026-05-14 |
| RW Aurigae | 226 / 114 exp. | 114 / 57 exp. | 0 | 0 | 2025-09-01 a 2026-09-09 |
| R Draconis | 570 / 290 exp. | 0 | 1259 / 639 exp. | 743 / 374 exp. | 2025-05-16 a 2026-09-27 |

Mejor base temporal en un solo detector (esto fija cuánto se puede mover un
objeto entre la primera y la última imagen):

| Objetivo | Detector | Base | Exposiciones | Desplazamiento esperado |
|---|---|---|---|---|
| Barnard's Star | D3 y D6 | 402 días | 63 | 11,4″ = 1,86 px |
| Epsilon Indi B | D2 | 526 días | 96 | 6,7″ = 1,10 px |
| WISE 0855 | D2 | 373 días | 48 | 8,3″ = 1,35 px |
| RW Aurigae | D1 | 373 días | 57 | — |
| R Draconis | D1 y D4 | 478 días | 599 | — |

Una posición cae casi siempre en **dos detectores a la vez** (147 de las 151
exposiciones de WISE 0855), en parejas fijas: D1 y D4, D2 y D5, D3 y D6. Eso
entrega dos colores del mismo punto en el mismo instante, justo lo que necesita
el termómetro de color de WP-26. Las "visitas" (huecos de más de un día) duran de 0
a 5 días; WISE 0855 tiene entre 5 y 10 por detector.

### 15.3 Estructura de un producto (recorte)

Orden y contenido verificados en los cinco objetivos.

| Índice | `EXTNAME` | Contenido | Unidad |
|---|---|---|---|
| 0 | `PRIMARY` | Sin datos; solo `VERSION` | — |
| 1 | `IMAGE` | Brillo superficial; **no** tiene restada la luz zodiacal | MJy/sr |
| 2 | `FLAGS` | Máscara de bits; la cabecera define la posición de cada bit (`MP_*`) | — |
| 3 | `VARIANCE` | Varianza de `IMAGE` | (MJy/sr)² |
| 4 | `ZODI` | Modelo de luz zodiacal | MJy/sr |
| 5 | `PSF` | Cubo 121×101×101, sobremuestreo ×10, 0,615″/px | — |
| 6 | `WCS-WAVE` | Tabla de una fila: `X`, `Y` (9 valores) y `VALUES` (9×9×2) | µm |

- La WCS es `RA---TAN-SIP` y se lee con `WCS(header_de_IMAGE, hdul)`.
  `DETECTOR` (entero), `DATE-OBS` y `MJD-OBS` están en la cabecera de `IMAGE`.
- La longitud de onda en un píxel se evalúa con
  `WCS(header, hdul, key="W").all_pix2world([[x, y]], 0)`; IRSA documenta
  interpolación bilineal de los puntos de control, con exactitud de ~1 nm y
  "solo para visualización". Para ciencia, IRSA remite a los productos
  `CWAVE`/`CBAND` de la WCS espectral (no evaluados).
- Una `size=0.1` (grados) da 58 o 59 píxeles por eje, según la exposición.
- IRSA avisa de que las entregas anteriores al 2026-03-31 tienen un error en la
  descripción de las zonas de la cabecera de la PSF, y recomienda el producto
  ePSF (QR3) para modelar.

### 15.4 Banderas (`FLAGS`)

Definiciones oficiales de IRSA (página de ayuda de espectrofotometría, consultada
el 2026-11-11). La cabecera de cada recorte confirma las posiciones de bit.

| Bit | Nombre | Significado | En la máscara dura |
|---|---|---|---|
| 0 | `TRANSIENT` | Impacto de rayo cósmico | Sí |
| 1 | `OVERFLOW` | Cerca de saturar | No (aviso) |
| 2 | `SUR_ERROR` | Posibles errores | Sí |
| 6 | `NONFUNC` | Píxel muerto | Sí |
| 7 | `DICHROIC` | Píxel inutilizable | Sí |
| 9 | `MISSING_DATA` | Sin datos | Sí |
| 10 | `HOT` | Píxel ruidoso | Sí |
| 11 | `COLD` | Píxel muerto | Sí |
| 15 | `NONLINEAR` | No corregible | Sí |
| 17 | `PERSIST` | Carga persistente | Sí |
| 19 | `OUTLIER` | Valor atípico marcado | No (aviso) |
| 21 | `SOURCE` | Fuente conocida | **No**: es nominal e incluye al objetivo |
| 26 a 29 | `BLOOM`, `SNOWBALL`, `HALO`, `SATELLITE_HALO` | Artefactos de estrellas brillantes (`BLOOM` y `HALO` aparecen en el recorte de R Draconis) | Sí |

IRSA ignora al ajustar: `SUR_ERROR`, `NONFUNC`, `MISSING_DATA`, `HOT`, `COLD`,
`NONLINEAR`, `PERSIST`, `BLOOM`, `SNOWBALL`, `HALO` y `SATELLITE_HALO`. La
máscara dura propuesta es esa lista más `DICHROIC` y `TRANSIENT`: los bits 0, 2,
6, 7, 9, 10, 11, 15, 17, 26, 27, 28 y 29. Con ella queda excluido del 0,8 % al
4,9 % de los píxeles de los cinco recortes, contra el 33 % al 100 % que excluye
hoy `FLAGS == 0`. Los bits que aparecen en los cinco recortes son 0, 1, 2, 6, 11,
17, 19, 21, 26 y 28. La tabla completa de bits está en el Suplemento Explicativo
de SPHEREx (Tabla 10 en la versión consultada), que no se leyó.

### 15.5 Experimento: ¿se ve WISE 0855 al sumar exposiciones?

Independiente de los motores de la app. Detalle y caveats en
`backend/tests/fixtures/real/experiment_wise0855_stack.json`.

- **Datos:** 22 de las 43 exposiciones D6 (4,41 a 5,01 µm) de `spherex_qr2`,
  del 2025-05-05 al 2026-05-11, descargadas alternando época temprana y tardía.
- **Método:** `IMAGE − ZODI`, menos la mediana de cada cuadro; máscara dura de
  §15.4; reproyección a una rejilla común; media ponderada por varianza inversa;
  apertura de 1,5 píxeles; el nulo son 400 posiciones al azar tratadas igual.
- **Resultado (siguiendo el movimiento previsto):** flujo en la posición de
  WISE 0855 de 0,427 MJy/sr·px (±0,033 formal), mayor que el de **el 97,25 % de
  las posiciones al azar** (11 de 400). El pico queda a menos de 0,5 px de la
  predicción. Al dividir las exposiciones en un grupo temprano (3, mayo de 2025)
  y uno tardío (11, mayo de 2026), el pico de cada grupo cae a ~0,5 px de su
  posición prevista y se desplaza en la dirección esperada (1,3 px de recorrido
  previsto), aunque el grupo temprano es débil (S/N formal 2,0). Sin seguir el
  movimiento: 96,25 %.
- **Flujo físico:** 0,380 ± 0,029 mJy en esa apertura, sin corrección de
  apertura. AllWISE da W2 = 13,704 ± 0,033, es decir 0,567 mJy esperados:
  cociente 0,67, compatible con la fracción del flujo que cae fuera de una
  apertura de 1,5 px (no medida).
- **Veredicto:** **sugerente, no confirmado.** Con un solo ensayo a priori,
  p ≈ 0,03 (~1,9σ). Los errores formales subestiman el ruido real por 1,4 a 1,9.
  El z robusto (~9) no es fiable porque el fondo tiene estrellas reales y su cola
  no es gaussiana.
- **Para confirmarlo:** las 43 exposiciones, los otros cinco detectores (si es
  frío debe desaparecer por debajo de ~3 µm: D1 a D4) y una medición de la
  corrección de apertura con la PSF.

### 15.6 Objetivo por objetivo (un recorte real de cada uno)

| Objetivo | Fixture | Detector | Longitud de onda en el objetivo | Fracción con `FLAGS == 0` (válida hoy) | Fracción excluida por la máscara dura |
|---|---|---|---|---|---|
| WISE 0855 | `wise0855_d6_20250505` | D6 | 4,961 µm | 67 % | 0,8 % |
| Barnard's Star | `barnards_star_d6_20250827` | D6 | 4,883 µm | 0 % | 1,2 % |
| Epsilon Indi B | `epsilon_indi_b_d6_20251104` | D6 | 4,631 µm | 22 % | 1,1 % |
| RW Aurigae | `rw_aurigae_d1_20250904` | D1 | 0,965 µm | 32 % | 1,3 % |
| R Draconis | `r_draconis_d3_20251226` | D3 | 1,636 µm | 0 % | 4,9 % |

Los cinco objetivos caen dentro de su recorte de 0,1° centrado en la posición
propagada a 2026,0 (píxel 28 a 29 de 58 o 59). Con la posición J2000, Barnard
quedaría a 4,5′ del centro, fuera de un recorte de 3′ de radio.

### 15.7 Cambios al plan

Estas enmiendas se suman a las de §9.2 y prevalecen sobre las fichas del documento
técnico.

**Nuevo orden de la fase B.** DAT-01 a DAT-05 bloquean todo lo demás: sin
recortes que funcionen y sin lectura correcta del producto no hay secuencia
posible. La fase B pasa a: WP-06, WP-07, **WP-33**, WP-08, WP-09, WP-10, WP-11.

**WP-33 (nuevo) · Lector de productos SPHEREx.**
- **Hallazgos:** DAT-04, DAT-05, DAT-07. **Depende de:** WP-05. **Bloquea:**
  WP-10, WP-12, WP-26. **Tamaño:** M. **Verificación independiente:** sí
  (validez científica).
- **Superficie de edición:** `backend/app/services/spherex_product.py` (nuevo),
  `backend/app/services/fits_processing.py`, `backend/app/services/spectral.py`
  y `backend/app/services/temporal.py` (solo para usar el lector),
  `backend/tests/test_spherex_product.py` (nuevo).
- **Cambio:** un único lector que abre por `EXTNAME` (nunca por índice), construye
  la WCS con `WCS(header, hdul)` (nunca `WCS(dict(header))`), evalúa la longitud
  de onda con `key="W"`, lee `DETECTOR`, `DATE-OBS` y `MJD-OBS` de `IMAGE`,
  expone `IMAGE − ZODI` y una máscara de calidad construida con los bits de
  §15.4 (`SOURCE` no se enmascara), y tolera tamaños de 58 o 59 píxeles.
- **Criterios de aceptación (con los cinco fixtures reales):**
  1. Las extensiones salen en el orden y con las formas de §15.3.
  2. La WCS se construye con SIP y el píxel del objetivo coincide con
     `observed_cutouts.json` dentro de 0,5 px.
  3. La longitud de onda en el objetivo coincide con `observed_cutouts.json`
     dentro de 0,001 µm.
  4. La fracción de píxeles válidos con la máscara dura es mayor que 0,95 en
     los cinco (hoy es 0 en dos).
  5. Un píxel con solo el bit 21 activo es válido.
  6. No queda ninguna llamada `WCS(dict(` en `backend/app`.
  7. El motor espectral deja de leer la PSF como tabla de longitudes de onda.

**WP-07 (enmendado).**
- La identidad de un producto es `obs_publisher_did`; `(obs_id, collection)` deja
  de ser clave única en la base.
- `FIELD_MAP`: detector desde `energy_bandpassname` (entero 1 a 6), banda desde
  `em_min`/`em_max` (metros a µm), fecha desde `t_min` (MJD), sin buscar
  `detector`, `band` ni `date_obs`.
- `maxrec` y el tope por colección dejan de truncar: paginar o avisar con un
  mensaje explícito cuando se alcance (R Draconis necesita más de 2500 filas).
- El analizador de CSV tolera los campos sobrantes de `cloud_access`.
- Las colecciones disponibles se listan por TAP (`spherex.obscore`), no por SIA2.
- Se mantiene el criterio de clave de caché completa de BE-01.

**WP-08 (enmendado).**
- La URL de recorte es `<access_url>?center=<ra>,<dec>&size=<grados>`.
- **Se elimina la descarga del archivo completo como respaldo**: si el recorte
  falla, se informa el error (70 MB por cuadro no es un respaldo razonable).
- Peticiones con ritmo (concurrencia de 1 a 2, pausa entre ellas) y reintento
  con espera creciente ante `503`, sin superar un tope.
- La clave de recorte incluye producto, posición, tamaño y versión del procesado.
- Decidir si se guarda el cubo de PSF (4,9 de 5,1 MB) o solo su cabecera.

**WP-10 (enmendado).**
- Una "visita" es un grupo de exposiciones **del mismo detector** separadas por
  menos de un día. La comparación de brillo exige además que la longitud de onda
  en el píxel del objetivo coincida dentro de una tolerancia (D5: propuesta de
  una a dos veces el ancho de banda, 0,04 a 0,08 µm), porque dentro de un
  detector cambia hasta 0,6 µm con la fila.
- Se resta `ZODI` y se aplica la máscara de §15.4.
- La pareja D1/D4, D2/D5 o D3/D6 de una misma exposición es el insumo del
  termómetro de color (WP-26).
- `PROCESSING_VERSION` incluye la versión de los datos de cada exposición
  (DAT-13).
- La rejilla común se calcula sobre el tamaño de cada recorte, no sobre 59×59.

**WP-26 (enmendado).** Usa el lector de WP-33. El espectro se arma con la
fotometría del objetivo en cada exposición, situada en la longitud de onda que
da `WCS-WAVE` en el píxel; con muchas exposiciones por detector (hasta ~600 en
R Draconis) el muestreo en longitud de onda es denso.

**WP-25 (enmendado).** El máximo de 2 px de desplazamiento (§4) hace que el modo
"Planeta X" dependa del apilado por época, no de ver el movimiento en cuadros
sueltos. El experimento de §15.5 es su primera prueba con datos reales.

**WP-28 (enmendado).** Hay 677 imágenes NEOWISE-R y 4 AllWISE en el campo de
WISE 0855; falta comprobar los otros campos.

### 15.8 Decisiones

| ID | Decisión | Estado |
|---|---|---|
| D5 | Tolerancia de longitud de onda para "misma banda" | Propuesta en §15.7; decidir con el espectro de variación real |
| D10 | Autorizar red para verificar datos reales | **Resuelta**: usada en WP-05 |
| D15 | Ventana que define una "visita" | Propuesta: mismo detector y separación menor que un día (§15.7) |
| D17 | Qué hacer con el cubo de PSF de cada recorte | Nueva: conservar, o solo su cabecera (4,9 MB por cuadro) |
| D18 | Completar el experimento de §15.5 (43 exposiciones, detectores D1 a D5) | Nueva: requiere más peticiones al servicio de recortes, que limita el ritmo |

### 15.9 Lo que no se verificó

- Las otras 21 exposiciones D6 de WISE 0855 y los detectores D1 a D5: el servicio
  respondió `503` de forma sostenida.
- El comportamiento de los tres objetivos restantes en un apilado.
- Si `OVERFLOW` o `PERSIST` afectan a los propios píxeles de Barnard's Star.
- Los productos `CWAVE`/`CBAND` y el ePSF que IRSA recomienda para ciencia.
- La tabla completa de bits del Suplemento Explicativo (se usó la página de ayuda).
- Que la posición de SIMBAD esté en época J2000; es la convención de SIMBAD y es
  coherente con la diferencia de ~85″ con la posición del enunciado, pero no se
  leyó la documentación.
- La corrección de apertura para convertir el flujo medido en flujo total.

Fuentes de esta sección (consultadas el 2026-11-11): la API SIA2 y el TAP de
IRSA; [ayuda de espectrofotometría de SPHEREx](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html);
[productos de datos de SPHEREx](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products);
[capacidades de recorte](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html);
SIMBAD (espejo de Harvard); catálogo AllWISE (`allwise_p3as_psd`).
