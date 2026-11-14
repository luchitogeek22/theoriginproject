# El desafío: Planet X and SPHEREx

**Este documento es la brújula del proyecto.** Toda decisión de producto, diseño
o código se contrasta contra él. Si una funcionalidad no acerca al usuario a
*ver cómo cambia un trozo de cielo en el tiempo*, no es prioridad.

| Dato | Valor |
|------|-------|
| Evento | 2026 NASA Space Apps Challenge |
| Desafío | Planet X and SPHEREx |
| Dificultad | Advanced |
| Temas | Astrophysics · Planets & Moons · Software |

## La idea en una línea

> El usuario ingresa coordenadas (RA y Dec) → la herramienta muestra una serie
> de imágenes SPHEREx de ese trozo de cielo como un pequeño video → cualquiera
> detecta a simple vista qué se movió o cambió de brillo.

Ese flujo es el producto. Todo lo demás es soporte o diferenciador.

## Enunciado oficial (texto original)

> Your challenge is to create a public-facing web tool to display images of the
> sky from the SPHEREx mission, making it easy for anyone to quickly see how
> they change over time. Users will enter the coordinates of a patch of sky
> (Right Ascension and declination). Your tool will display a series of images
> of that patch like a little video, making it easy to spot moving objects.

> Test your tool on Barnard's Star, Epsilon Indi B (a pair of brown dwarfs
> orbiting a star), WISE 0855 (a fast-moving brown dwarf Right Ascension
> 08h55m10.831s, declination -7d14m42.53s), and variable stars RW Aurigae and
> R Draconis.

## Requisitos obligatorios

Salen directamente del enunciado. Sin estos no hay entrega válida.

| ID | Requisito | Frase del enunciado |
|----|-----------|---------------------|
| R1 | Parcial | 2026-11-12: en un Chromium real, sin iniciar sesión, la portada y los cinco enlaces cargan la secuencia (`frontend/e2e`, 19 pruebas). Falta observarlo en el despliegue público. |
| R2 | Cumple | Observado en Chromium: `?q=08h55m10.831s -7d14m42.53s` se resuelve y la URL pasa a coordenadas numéricas; `?ra=&dec=` y nombres funcionan; una consulta inválida da un mensaje claro. |
| R3 | Cumple | Observado en Chromium: los cuadros mostrados son recortes reales de SPHEREx (IRSA) de los cinco objetivos, con fecha, detector, longitud de onda, banderas y colección por cuadro. Servidos desde la caché de secuencias reales con IRSA cortado. |
| R4 | Cumple | Observado en Chromium: la secuencia se reproduce y la imagen cambia en cada paso; hay pausa, anterior, siguiente, velocidad, teclado, parpadeo A/B y vista antes/después. |
| R5 | Parcial | De la portada al video hay un clic (observado); la demo guiada y la frase "se movió X″ hacia el <rumbo>" ayudan a entenderlo. Falta la prueba con personas sin formación (tabla vacía en `docs/demo.md`). |
| R6 | Funciona en los cinco objetivos de prueba | "Test your tool on..." |

## Objetivos de prueba

Son el criterio de aceptación real: la demo se juzga con estos cinco.

| Objetivo | Tipo | Qué debe verse | RA / Dec (J2000) |
|----------|------|----------------|------------------|
| Barnard's Star | Estrella de alto movimiento propio | Desplazamiento | 17h57m48.5s, +04d41m36s * |
| Epsilon Indi B | Par de enanas marrones orbitando una estrella | Desplazamiento | 22h04m10.5s, -56d46m58s * |
| WISE 0855 | Enana marrón rápida y muy fría | Desplazamiento | 08h55m10.831s, -07d14m42.53s |
| RW Aurigae | Estrella variable | Cambio de brillo | 05h07m49.5s, +30d24m05s * |
| R Draconis | Estrella variable | Cambio de brillo | 16h32m40.2s, +66d45m18s * |

\* Coordenadas aproximadas de referencia; solo las de WISE 0855 vienen del
enunciado. Confirmar con SIMBAD antes de fijarlas en código o en la demo.

Hay dos fenómenos distintos y la herramienta debe servir para ambos:
**movimiento** (tres objetivos) y **variabilidad de brillo** (dos objetivos).

## Consideraciones opcionales (diferenciadores)

No son obligatorias, pero son la lista de deseos de quien redactó el desafío.
Cada una resuelta bien suma frente a otros equipos.

| ID | Consideración | Por qué importa |
|----|---------------|-----------------|
| C1 | Parcial | Las colecciones se descubren por TAP (`spherex.obscore`, verificado en vivo: qr2, qr2_deep, qr3, qr3_deep; la consulta tarda 60 a 90 s y corre en segundo plano) con la lista configurada como respaldo, y los DOI salen de una tabla de datos. |
| C2 | Parcial | Un solo detector por secuencia (nunca se mezclan); la suma ponderada existe en el motor, la interfaz solo la expone en el modo Planeta X. |
| C3 | Parcial | Espectrofotometría relativa y termómetro de color implementados y probados con datos sintéticos; sin datos reales ni navegador. |
| C4 | Parcial | Apilado ponderado y búsqueda por desplazamiento implementados y probados con datos sintéticos; sin datos reales ni navegador. |
| C5 | Parcial | Campo de visión configurable (2 a 60 arcmin) reflejado en la URL, con sugerencia cuando el desplazamiento supera la mitad del campo. No visto en navegador. |
| C6 | Parcial | Gaia DR3 (marcas y trayectorias) y cuadro AllWISE W2 implementados; el WISE se verificó contra IRSA; Gaia contra el servicio real solo para el campo de WISE 0855. Aladin sin verificar en navegador. |
| C7 | Parcial | `?ra=&dec=&fov=&mode=&detector=&ref=&frame=&embed=` y `?q=`; cabeceras verificadas en el servidor de Next (`/time-explorer` se puede incrustar, el resto mantiene `DENY`). El iframe no se probó en un navegador. |
| C8 | Parcial | Fracción con banderas y cobertura por cuadro, y verificación de candidatos con siete comprobaciones; sin verificar en navegador. |
| C9 | Parcial | Astropy, reproject, photutils, astroquery (Gaia, SkyBoT) y Aladin Lite 3.6.1 fijo; Aladin no se verificó en navegador. |

## Implicancias técnicas a validar

Hipótesis de trabajo derivadas del enunciado y de las características de la
misión. **Ninguna está confirmada contra datos reales todavía.**

- **El movimiento es pequeño frente al píxel.** El píxel de SPHEREx ronda los
  6 arcsec y los objetivos se mueven del orden de 5 a 10 arcsec por año. Entre
  dos pasadas consecutivas el desplazamiento puede ser menor a un píxel. Por
  eso el enunciado sugiere restar imágenes (C4) y superponer catálogos de otras
  épocas (C6): pueden ser la única forma de hacer visible el movimiento.
- **Los objetivos fríos son débiles.** WISE 0855 puede quedar cerca del límite
  de detección en una sola banda; sumar por detector (C2) pasa de opcional a
  necesario para ese objetivo.
- **Variabilidad exige escala fija.** Si cada cuadro se normaliza por separado,
  el cambio de brillo de RW Aurigae y R Draconis desaparece. La secuencia debe
  compartir una misma escala de intensidad.
- **Cuadros comparables.** Cada exposición observa un punto del cielo en una
  longitud de onda distinta. Una secuencia temporal solo es honesta si compara
  cuadros de la misma banda o detector.
- **Cobertura desigual.** El cielo completo se cubre cada seis meses, así que
  la mayoría de las posiciones tiene pocas épocas. La interfaz debe comunicar
  cuántas épocas hay y de qué fechas.

## Cómo se gana

Criterios generales con los que Space Apps evalúa los proyectos (confirmar la
rúbrica vigente de 2026 antes de la entrega):

| Criterio | Qué significa para este proyecto |
|----------|----------------------------------|
| Impacto | Un voluntario sin formación descubre algo real con la herramienta |
| Creatividad | Una forma nueva de aprovechar las 102 bandas o de hacer visible el movimiento |
| Validez | Datos reales, procesamiento correcto, nada inventado |
| Relevancia | Responde exactamente al enunciado, no a un problema vecino |
| Presentación | La demo cuenta la historia en segundos con los cinco objetivos |

Reglas de decisión que se desprenden:

1. **Primero el flujo principal.** Coordenadas → video debe funcionar de punta
   a punta en los cinco objetivos antes de sumar cualquier otra cosa.
2. **Cualquiera debe entenderlo.** El público son voluntarios, no astrónomos.
   Cero jerga sin explicar, cero pasos previos obligatorios.
3. **Rápido.** "Quickly" está en el enunciado: el tiempo hasta el primer video
   es una métrica del producto.
4. **Honestidad científica.** Sin cobertura, se dice. Nunca se rellena con
   datos sintéticos.
5. **Cada diferenciador debe servir al descubrimiento.** Si no ayuda a ver un
   cambio, no entra.

## Fuera de foco

Señales de que el proyecto se está desviando:

- Funcionalidades que no dependen de imágenes SPHEREx ni del eje temporal.
- Visualizaciones decorativas que no muestran datos observados.
- Acceso condicionado a registro para llegar al flujo principal (rompe R1).
- Análisis automáticos que reemplazan, en vez de asistir, el ojo del usuario.

## Estado de cumplimiento

Matriz viva. Se actualiza a medida que se verifica cada punto contra el código
y contra datos reales. Estados: `Por verificar`, `Cumple`, `Parcial`, `Falta`.

| ID | Estado | Evidencia |
|----|--------|-----------|
| R1 | Por verificar | |
| R2 | Por verificar | |
| R3 | Parcial | WP-05 (2026-11-11): los datos reales existen y son accesibles para los cinco objetivos. La app no los lee bien: IRSA rechaza su URL de recorte (HTTP 422) y baja el detector completo, y el mapeo de SIA2 no reconoce detector ni fecha. Ver auditoría NASA §15. |
| R4 | Por verificar | |
| R5 | Por verificar | |
| R6 — Barnard's Star | Parcial | 2026-11-12: 12 cuadros reales de D6 (2025-08 a 2026-09), desplazamiento previsto 11,4″ con marcas de Gaia; el apilado siguiendo su movimiento propio tiene el pico exactamente en el píxel previsto (σ 678). No visto en navegador. |
| R6 — Epsilon Indi B | Parcial | 2026-11-12: 12 cuadros reales de D6 (2025-04 a 2026-09), desplazamiento previsto 6,6″; apilado con su movimiento propio con el pico en el píxel previsto (σ 156). La separación del par de enanas marrones no se verificó. No visto en navegador. |
| R6 — WISE 0855 | Parcial | 2026-11-12: 12 cuadros reales de D6 (2025-05 a 2026-05) y cuadro AllWISE W2 real. Es débil (SNR mediana 3,4 por cuadro): el apilado siguiendo su movimiento propio da el pico en el píxel previsto con σ 11,8 y p empírico < 0,001; señal compatible, no detección confirmada. La búsqueda a ciegas no lo encuentra (movimiento de 1,3 px en la ventana). No visto en navegador. |
| R6 — RW Aurigae | Parcial | 2026-11-12: 9 cuadros reales de D1 (0,77 a 0,88 µm, 2025-09 a 2026-09) y curva de luz relativa a 4 estrellas de Gaia (amplitud aparente ±48 %, sin corrección de color). No visto en navegador. |
| R6 — R Draconis | Parcial | 2026-11-12: 10 cuadros reales de D1 (2025-08 a 2026-09). La estrella satura el núcleo en D1, D3, D5 y D6; con fotometría de las alas de la PSF (valores relativos) los 10 puntos son válidos y varían de 0,63 a 1,64 del valor mediano, coherente con una variable de largo periodo. Curva absoluta (Gaia no respondió en esa corrida). No visto en navegador. |
| C1 | Parcial | WP-05: QR2 y QR3 son periodos consecutivos y se pueden descubrir por TAP; la app los fija en configuración y SIA2 no distingue una colección inexistente de una sin cobertura. |
| C2 | Por verificar | |
| C3 | Por verificar | |
| C4 | Por verificar | |
| C5 | Por verificar | |
| C6 | Por verificar | |
| C7 | Por verificar | |
| C8 | Por verificar | |
| C9 | Por verificar | |

Un punto pasa a `Cumple` solo con evidencia observada: una ruta de la
aplicación funcionando con datos reales, no la existencia de un archivo.

## Contexto científico

- SPHEREx mapea todo el cielo cada seis meses, desde mayo de 2025, en 102
  bandas del infrarrojo cercano, con seis arreglos de detectores.
- Es especialmente sensible a objetos ricos en hidrógeno, agua, dióxido y
  monóxido de carbono.
- Plutón se descubrió comparando dos imágenes tomadas en momentos distintos.
  Proyectos como Backyard Worlds repiten esa técnica con voluntarios, y así se
  descubrió la mayoría de las enanas marrones y cometas conocidos.
- El volumen de datos supera lo que una persona o un programa puede revisar:
  la herramienta existe para que mucha gente pueda colaborar.

## Recursos

### Pestaña *Resources* del desafío (copiada el 2026-11-13, texto original)

> NASA does not endorse any non-U.S. Government entity and is not responsible
> for information contained on non-U.S. Government websites. For non-U.S.
> Government websites, participants must comply with any data use parameters
> of that specific website.
>
> **NASA Data & Resources**
>
> - **NASA/IPAC Infrared Science Archive: SPHEREx resources**
> - **SPHEREx Tutorial Notebooks:** Example Jupyter notebooks for how to access
>   the SPHEREx data via Python.
> - **WiseView:** A similar tool made for viewing data from an earlier NASA
>   mission called WISE. It's been used by the public to make hundreds of
>   discoveries. Feel free to use it as a model or as inspiration!
> - **Gaia Mission Data:** Be sure to use the latest data release (Data Release 3).
>
> **Space Agency Partner Resources — CSA (Canadian Space Agency)**
>
> - **NEOSSat: Observing Asteroids, Space Debris and Exoplanets:** Learn about
>   NEOSSat, the world's first space telescope dedicated to detecting and
>   tracking asteroids, comets, satellites, and space debris. This CSA resource
>   highlights how Canada is helping protect our understanding of near-Earth
>   space by contributing to international efforts to identify and monitor
>   objects that could pose risks to Earth or spacecraft.
> - **Canadian Astronomy Data Centre (CADC):** The CADC provides access to a vast
>   collection of astronomical observations from Canadian and international
>   telescopes and space missions. Through this resource, participants can
>   explore real scientific data used by astronomers to study stars, galaxies,
>   exoplanets, asteroids, and other celestial objects.
> - **NEOSSat Data Tutorial:** This tutorial demonstrates how to use Python to
>   visualize data from Canada's NEOSSat mission. Follow step-by-step
>   instructions to access spacecraft observations, create visualizations, and
>   explore data collected by Canada's space telescope.
> - **NEOSSat Dataset:** This dataset contains observations collected by
>   NEOSSat, Canada's Near-Earth Object Surveillance Satellite. The data
>   supports the detection and tracking of asteroids, comets, satellites, and
>   space debris. Explore real observations from Canada's space telescope and
>   learn how objects are monitored in near-Earth space.

### Relación de cada recurso con el producto

Enlaces copiados de memoria: confirmarlos contra la pestaña *Resources* oficial.

| Recurso | Enlace de referencia | Estado en el producto |
|---|---|---|
| IRSA: SPHEREx | https://irsa.ipac.caltech.edu/Missions/spherex.html | ✅ Núcleo. SIA2, TAP (`spherex.obscore`) y recortes sobre DR1 + QR3; DOI de DR1 `10.26131/IRSA678`. |
| SPHEREx Tutorial Notebooks | https://caltech-ipac.github.io/irsa-tutorials/spherex/ | ✅ Intro y Cutouts (misma sintaxis y extensiones), ePSF (corrección de apertura por zona, `photometry.py`), HiPS (fondo del mapa Aladin). Source Discovery y Mosaic no aplican al flujo temporal. |
| WiseView | http://byw.tools/wiseview | ✅ Parpadeo A/B, antes/después, contraste/brillo/invertir, coordenadas al hacer clic y vista de diferencia contra el cuadro A (naranja/azul, ruido < 3σ oculto). |
| Gaia DR3 | https://www.cosmos.esa.int/web/gaia/dr3 | ✅ `catalogs.py` consulta `gaiadr3.gaia_source` y propaga desde J2016.0. |
| CSA: NEOSSat | https://www.asc-csa.gc.ca/eng/satellites/neossat/ | ✅ Panel "Otras misiones: NEOSSat (CSA)" en el explorador temporal, con contexto de la misión. |
| CADC | https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca | ✅ `GET /api/v1/sky/neossat` consulta el TAP de CADC (`argus`, CAOM2) por coordenada; 503 honesto si no responde. |
| NEOSSat Data Tutorial / Dataset | https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/neossat | ✅ Cobertura por objetivo en vivo (r = 0,25°, 2026-11-13): Barnard 652, ε Indi B 2, WISE 0855 7, RW Aur 0, R Dra 8; enlace a la colección. Óptico y apuntado: épocas extra, no cuadros SPHEREx. |

### Contraste con los notebooks de IRSA (2026-11-13)

Verificado en vivo contra IRSA, no solo leído:

- **Colecciones.** Los notebooks usan `spherex_dr1`, `spherex_dr1_deep`,
  `spherex_qr3` y `spherex_qr3_deep`, y dicen que DR1 y QR3 reemplazan a QR2.
  SIA ya no devuelve nada para `spherex_qr2`. DR1 cubre de 2025W19 a 2026W1x
  (reprocesado, `l2b-v27`) y QR3 solo de 2026W3x en adelante; no comparten
  ninguna exposición, así que no hay cuadros duplicados. Productos por objetivo
  (DR1 / QR3): WISE 0855 261 / 0, Barnard 240 / 123, Epsilon Indi B 345 / 120,
  RW Aurigae 226 / 109, R Draconis 413 / 126. **La app solo tenía QR2/QR3 en
  la lista configurada: en vivo y sin caché, WISE 0855 no habría tenido ningún
  cuadro.** Corregido en `config.py` y `.env.example`.
- **Recorte.** `?center=RA,Dec&size=<grados>` devuelve HTTP 200 y un FITS
  válido en unos 3 s sobre URL de DR1, igual con o sin la `d` final del
  notebook. El HTTP 422 de WP-05 no se reproduce.
- **Secuencias en vivo con DR1** (backend local, IRSA real, sin caché):
  WISE 0855 12 cuadros D6 2025-05 a 2026-05 (46 épocas, desplazamiento previsto
  8,3″, 114 s); Barnard 12 cuadros D6 2025-08 a 2026-09 mezclando DR1 y QR3
  (93 s); R Draconis 7 cuadros D6 de DR1 y DR1 Deep (214 s).
- **Resuelto (2026-11-13, tarde).** DOI de DR1 en `collection_dois.json`:
  `10.26131/IRSA678` (DR1 Spectral Images, DataCite 2026-11-02; DR1 Deep usa el
  mismo). El cubo todo-cielo tiene `10.26131/IRSA679`.
- **Resuelto: mapa del cielo con SPHEREx.** La HiPS DR1 de IRSA
  (`https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube`,
  teselas PNG, 102 planos) es ahora el fondo de Aladin en lugar de 2MASS.
  Observado en Chromium dentro de `/time-explorer` (16 teselas 200).
- **Incidente CDS (2026-11-13).** `aladin.cds.unistra.fr/AladinLite/api/v3/*`
  devuelve 404 para todas las versiones (también `latest`), SIMBAD da 404 y las
  HiPS de alasky no responden. El mapa no cargaba. Aladin se carga ahora como
  módulo ES desde `cdn.jsdelivr.net/npm/aladin-lite@3.6.5`. Las capas Gaia y
  WISE siguen alojadas en CDS: fallarán con su aviso mientras dure la caída.
- **Resuelto: ePSF.** Con DR1 (v7+) la fotometría divide por la energía
  encerrada del ePSF de la zona más cercana (medido en WISE 0855 D6: 0,965,
  +3,6 %; variación entre zonas ±0,6 %). Los productos sin `EPSF` no cambian.
  Los notebooks no traen series temporales: la secuencia por épocas es aporte
  propio.

### Otras referencias

- NASA/IPAC IRSA, archivo de datos SPHEREx: https://irsa.ipac.caltech.edu
- Aladin Lite (CDS): https://aladin.cds.unistra.fr/AladinLite/ (script servido desde npm/jsDelivr)
- Astropy: https://www.astropy.org
- Backyard Worlds: https://www.backyardworlds.org

## Documentos relacionados

- [architecture.md](architecture.md) — componentes y decisiones técnicas.
- [api-contract.md](api-contract.md) — contrato de la API.
- [deployment.md](deployment.md) — despliegue.
