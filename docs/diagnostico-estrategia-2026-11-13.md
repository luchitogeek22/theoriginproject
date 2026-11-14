# The Origin Project: dónde estamos y cómo ganar

NASA Space Apps 2026 · Planet X and SPHEREx · diagnóstico al 2026-11-13

Auditoría del repositorio, investigación de las fuentes oficiales y estrategia
para las 48 horas que quedan antes de la entrega.

**Base de evidencia:**

- Código en `developer` (HEAD 549d18b).
- Recorrido en Chromium con datos reales en caché.
- Pruebas en vivo contra el backend de producción (Railway), IRSA, CADC y Gaia.
- Lectura de las páginas oficiales de Space Apps.

Las afirmaciones sin verificar están marcadas como tales.

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Qué construimos realmente](#2-qué-construimos-realmente)
3. [Auditoría funcional y técnica](#3-auditoría-funcional-y-técnica)
4. [Evaluación científica](#4-evaluación-científica)
5. [Comparación con herramientas y recursos](#5-comparación-con-herramientas-y-recursos)
6. [Brechas respecto al desafío](#6-brechas-respecto-al-desafío)
7. [Oportunidades de innovación](#7-oportunidades-de-innovación)
8. [Matriz de oportunidades de producto](#8-matriz-de-oportunidades-de-producto)
9. [Evaluación crítica como jurado](#9-evaluación-crítica-como-jurado)
10. [Propuesta de producto](#10-propuesta-de-producto)
11. [Funcionalidades prioritarias](#11-funcionalidades-prioritarias)
12. [Arquitectura recomendada](#12-arquitectura-recomendada)
13. [Roadmap de implementación (48 h)](#13-roadmap-de-implementación-48-h)
14. [Guion de demostración](#14-guion-de-demostración)
15. [Riesgos](#15-riesgos-y-puntos-que-pueden-hacernos-perder)
16. [Veredicto final](#16-veredicto-final)

---

## 1. Resumen ejecutivo

**El núcleo del desafío funciona y es sólido.**

- El flujo coordenadas → video usa cuadros SPHEREx reales, alineados y con escala común, en los cinco objetivos.
- Está probado de punta a punta en un navegador real (32 pruebas e2e).
- En producción el video sale en 7 a 11 segundos desde caché y ya usa DR1.

**Lo que hoy nos hace perder es lo que rodea al núcleo:**

- Nueve rutas para un desafío de un solo flujo.
- Páginas vacías o rotas: Candidatos, Descubrimientos, Cielo vivo y Laboratorio espectral.
- Un "Copilot" que es búsqueda por palabras clave.
- Una portada genérica que no menciona el desafío.
- **No mostramos ningún resultado medido:** la frase de movimiento repite el catálogo, y la misma pantalla lo aclara.

**Recomendación: no pivotar.** Recortar a un flujo y convertir el visor en un
*flipbook que mide*: el movimiento propio medido sobre los mismos cuadros del
video y comparado con Gaia. No requiere descargas extra ni almacenamiento
nuevo, tarda segundos y funciona en cualquier coordenada.

La entrega es el **domingo 15 de noviembre a las 23:59, hora local del
evento**, y el plan está dimensionado para ese plazo.

| | |
|---|---|
| **Nivel actual** | Producto funcional y honesto. Técnicamente está por encima del promedio de los repositorios rivales que encontramos, pero no tiene una idea memorable ni un resultado demostrable. Es competitivo para pasar la etapa local y débil para la global. |
| **Mejor oportunidad** | Ser el único equipo que, además de mostrar el cambio, lo *mide* y lo contrasta con valores publicados, en segundos y para cualquier coordenada. |

## 2. Qué construimos realmente

Un monolito de dos piezas:

- **Frontend Next.js:** unas 11 500 líneas TS/TSX, 9 rutas más la portada.
- **Backend FastAPI:** unas 6 600 líneas Python, 19 servicios y 10 routers.

Qué hace el backend:

- Consulta IRSA por SIA2 y TAP.
- Recorta y reproyecta con Astropy y reproject, y mide con photutils.
- Consulta Gaia DR3, SkyBoT, AllWISE y, desde hoy, CADC.
- Guarda en caché las secuencias. Si IRSA no responde, sirve el último resultado real y lo dice en pantalla.

Pruebas:

- Backend: 30 archivos con unas 304 pruebas, casi todas sobre FITS sintéticos.
- Frontend: 7 especificaciones Playwright y 5 archivos de pruebas Node.

La ciencia está muy probada con datos sintéticos. La interfaz está probada solo
en el flujo principal.

## 3. Auditoría funcional y técnica

| Funcionalidad | Estado | Evidencia | Comentario |
|---|---|---|---|
| Video de secuencia (núcleo) | ✅ Funcional, datos reales | `routers/sequences.py`, e2e `five-targets.spec.ts` | Grilla común, un detector, escala compartida en brillo, caché honesta, exportación WebM. |
| Cinco objetivos y demo guiada | ✅ Funcional | `lib/targets.ts`, `demo/page.tsx` | La demo dispara trabajos reales; sin caché caliente tarda minutos. |
| Parpadeo, antes/después, diferencia, sondeo | ✅ Funcional | `SequencePlayer.tsx`, `DifferenceFrame.tsx` | Cubre los controles de WiseView que importan. |
| Mapa Aladin con HiPS SPHEREx DR1 | ✅ Funcional | `AladinViewer.tsx` | Gaia y WISE dependen de CDS, que hoy está caído. |
| Curva de luz | ⚠️ Parcial | `sequence.py:88`, `sequences.py:93-102` | Muestrea N cuadros antes de filtrar por longitud de onda: R Dra queda con 7 puntos de 24 cuadros bajados. En producción salió absoluta, sin estrellas de comparación. |
| Espectro multi-detector | ✅ Funcional | `SpectrumPanel.tsx`, `routers/spectra.py` | Real, pero escondido debajo de una herramienta confusa. |
| "Perfil espacial" del laboratorio espectral | ❌ Científicamente engañoso | `services/spectral.py:56-62` | Grafica una franja del recorte contra la longitud de onda, así que cada fila es otro trozo de cielo. Además queda vacío tras recargar. |
| Apilado y búsqueda (modo Planeta X) | ✅ Funcional | `services/shift_stack.py` | Significancia corregida por ensayos. Es la base para medir movimiento. |
| Cielo vivo (esfera 3D) | ⚠️ Parcial | `living-sky/page.tsx:185` | Sin imágenes del cielo. "Iniciar investigación" navega sin coordenadas y pierde la selección. |
| Copilot | ❌ Promete lo que no es | `CopilotPanel.tsx:23-108` | Coincidencia de palabras clave sobre 5 temas con textos fijos. Si un jurado escribe una pregunta libre, recibe la respuesta por defecto. |
| Candidatos | ❌ Vacío y con fallas | `analysis.py:69-95, 209-226, 267-282` | Solo se crean desde una comparación manual difícil de alcanzar, y 4 de las 6 categorías del filtro nunca aparecen. La lista es global entre usuarios y la verificación escribe sin autenticación. La columna Obs A/B siempre muestra "—". |
| Descubrimientos | ❌ Duplicado | `discoveries/page.tsx:4-6` | Redirige a Candidatos. |
| Diario de investigación | ⚠️ Parcial | `journal/page.tsx:16-35` | Métodos fijos en código, mediciones siempre vacías, no registra el trabajo del explorador temporal. |
| Login (Supabase) | ⚠️ Fuera del desafío | `middleware.ts:13` | Protege solo el diario. Agrega fricción sin valor para el jurado. |
| Curvas de las tarjetas de objetivos | ⚠️ Ilustración sin etiqueta | `TargetCurve.tsx:3-9` | Trazos fijos. El código dice "ilustrativo"; la pantalla no. |
| Portada | ℹ️ Simulación etiquetada | `landing/simulation.ts` | Honesta, pero mide 10 400 px de alto, muestra un planeta ilustrado y tiene un titular genérico ("Explora el universo"). |
| Despliegue público | ⚠️ Atrasado | Railway `/api/v1/sky/neossat` → 404 | El backend está sano y usa DR1, pero los cambios de hoy no están desplegados. |

**Inconsistencia documental.** En `docs/challenge.md`, la columna con el texto
de R1–R6 y C1–C9 quedó sobrescrita por el estado, y la matriz "Estado de
cumplimiento" sigue en "Por verificar". El texto original se recupera del
primer commit del archivo.

## 4. Evaluación científica

### Lo que está bien

- Nunca se mezclan detectores. Cada cuadro se reproyecta a una grilla común con el norte arriba, y el modo brillo usa una sola escala física.
- Se respetan las banderas de calidad, el ZODI que el archivo no resta, la PSF por zona (ePSF) y el WCS espectral.
- El apilado que sigue el movimiento propio pone el pico en el píxel previsto:

  | Objetivo | Significancia |
  |---|---|
  | Barnard | σ 678 |
  | Epsilon Indi B | σ 156 |
  | WISE 0855 | σ 11,8 (p empírico < 0,001) |

  Es la evidencia científica más fuerte del proyecto, y hoy casi no se ve.
- La honestidad es una ventaja: la app dice "no detectado", "absoluta", "desde caché" o "catálogo, no medición" cuando corresponde.

### Lo que un astrónomo objetaría

- **No medimos el movimiento.** El "se movió 11,4″" sale del catálogo, y un jurado con formación pregunta enseguida qué midió la herramienta.
- **La curva de las variables tiene pocos puntos.** De 24 cuadros bajados para R Dra quedan 7 a la misma longitud de onda. Hay más épocas disponibles (603 en D6, por estar en la zona profunda del polo eclíptico), pero aprovecharlas no conviene: ver la nota al final de §7.
- **La variabilidad de color se confunde con la temporal.** El filtro de ±0,06 µm es correcto, pero se aplica después de muestrear y deja muy pocos puntos.
- **WISE 0855 no se detecta cuadro a cuadro** (SNR mediana 2,6 en producción). Solo el apilado lo ve: hay que mostrarlo así y no prometer más.
- **El "perfil espacial" no es un espectro** y no debería estar en una página llamada laboratorio espectral.
- **Las estrellas de comparación son frágiles.**
  - Gaia (ESA) respondió 429 en nuestras pruebas y las curvas de producción quedaron absolutas.
  - La nota "solo 3 estrellas medibles, se necesitan al menos 3" se contradice: cuenta las candidatas, no las que pasan el corte.

### Valores de referencia para contrastar

| Objetivo | Valor publicado | Fuente | Estado |
|---|---|---|---|
| WISE 0855 | ≈ 8,1–8,2″/año; paralaje ≈ 449 mas | Luhman & Esplin 2016; programa HST 13802 | Verificar en SIMBAD |
| Barnard | ≈ 10,4″/año | Gaia DR3 (ya lo consulta la app) | Usar Gaia |
| R Draconis | Mira, período ≈ 245 días | GCVS / AAVSO | Verificar en VSX |
| RW Aurigae | T Tauri, variaciones irregulares de 1–2 mag y oscurecimientos profundos | Literatura (2014–2016) | Sin período: mostrar la dispersión |

## 5. Comparación con herramientas y recursos

| Recurso | Qué aporta | Límite real | Uso nuestro |
|---|---|---|---|
| IRSA SPHEREx (DR1 + QR3) | Imágenes espectrales L2, recortes, HiPS DR1 y herramientas web (Spectrophotometry, Mosaic, Cutout, Source Discovery, MOST) | No hay catálogo de fuentes publicado (previsto para 2027). Hay una pasada por posición cada seis meses, salvo en las zonas profundas. | Núcleo, correcto. |
| Notebooks de IRSA | Recetas Python: intro, recortes, ePSF, HiPS, mosaicos, descubrimiento de fuentes | Ninguno trata series temporales. | Alineado; la serie temporal es aporte propio. |
| WiseView / Backyard Worlds | Parpadeo de épocas WISE para voluntarios; más de 1 500 enanas marrones halladas por ciudadanos (JPL) | Solo WISE; sin información espectral ni medición. | El modelo de interacción ya está cubierto. |
| Gaia DR3 | Movimiento propio, paralaje, clasificación de variables | El TAP de ESA limita los pedidos, y la fotometría por época no se consulta por ADQL. | Marcas, trayectorias y estrellas de comparación. |
| NEOSSat / CADC | Imágenes ópticas apuntadas, 3″/px, campo ≈ 0,86°, V ≈ 19,5 | Sin cobertura de todo el cielo; RW Aur tiene 0 observaciones. | Panel de cobertura. Correcto como contexto, no como núcleo. |
| MOST (IRSA) | Imágenes que cubren la efeméride de un cuerpo del Sistema Solar | Requiere una órbita, no RA/Dec; no sirve para estrellas. | No aplica al flujo principal. |

### Competencia observada

- Hay al menos ocho repositorios públicos de equipos que trabajan este desafío.
- En Zenodo hay un registro, "SkyShift" (octubre de 2026), que ya ofrece:
  - parpadeo, deslizador y diferencia;
  - etiquetado de objetos conocidos;
  - un modo de ciencia ciudadana con movimientos inyectados y pruebas de inyección-recuperación.
- Varios rivales suman chatbots (Gemini) y juegos.

**Parpadeo y diferencia ya no nos diferencian.** Lo que no vimos en ningún
rival: resultados medidos y contrastados con valores publicados en los cinco
objetivos.

## 6. Brechas respecto al desafío

| ID | Requisito o consideración | Estado | Brecha |
|---|---|---|---|
| R1 | Herramienta web pública, sin barreras | ⚠️ Parcial | Desplegar lo de hoy y comprobarlo en el sitio público. Clasificar el dominio en FortiGuard, como recomienda Space Apps. |
| R2–R4 | RA/Dec → imágenes reales → video | ✅ Cumple | — |
| R5 | Cualquiera ve el cambio rápido | ⚠️ Parcial | Falta la prueba con personas sin formación. Sobran páginas que distraen. |
| R6 | Cinco objetivos | ✅ Cumple | Las curvas de RW Aur y R Dra tienen pocos puntos. |
| C2 | 102 bandas y suma por detector | ⚠️ Parcial | La suma por detector solo aparece en el modo Planeta X. |
| C3 | Espectros al vuelo ("extra kudos") | ⚠️ Parcial | Existe, pero está escondido en una página confusa. |
| C4 | Sumar o restar épocas | ✅ Cumple | — |
| C1, C5–C9 | Actualizable, campo, superposiciones, URL, banderas, Astropy/Aladin | ✅ Cumple | — |
| Entrega | Video ≤ 30 s o 7 diapositivas; declarar el uso de IA | ❌ Falta | Un video más largo deja el proyecto fuera de la evaluación global. Hay que declarar el uso de IA en el código. |

## 7. Oportunidades de innovación

1. **Medir, no solo mostrar.** Movimiento propio ajustado sobre los mismos cuadros del video, con el apilado sobre una grilla de velocidades que ya existe en el código, comparado con Gaia. Es cálculo local sobre datos ya descargados: segundos, en cualquier coordenada.
2. **Curvas de luz más honestas dentro del mismo presupuesto.** Filtrar mejor por longitud de onda los cuadros que ya se bajan y mostrar la variación con su incertidumbre, sin prometer un período.
3. **Separar color y tiempo como parte del relato.** Cada exposición ve otro color. Una línea que diga "estos cuadros tienen el mismo color" educa y nos diferencia.
4. **Tarjeta de resultado verificable.** Lo que medimos, lo publicado, la diferencia y el enlace a la fuente: un jurado lo comprueba en 10 segundos.

**Descartado: el período de R Dra con cientos de épocas.** Lo evaluamos y no conviene:

- Un recorte DR1 pesa 4 MB (el 97 % es la tabla ePSF), así que 603 recortes son unos 2,4 GB.
- Tardaría de 4 a 30 minutos por objetivo, contra los 7–11 s actuales del video.
- Producción usa almacenamiento local en un disco efímero que se borra en cada despliegue (`docs/deployment.md`); guardarlos exigiría S3 o un volumen pago.
- Precalcularlo solo para los objetivos de prueba no sirve para otras coordenadas y parecería una demo preparada.
- La ganancia es un número para un solo objeto, que además ya tiene su período publicado.

## 8. Matriz de oportunidades de producto

Escala de 1 a 5. "Demostrable en 48 h" pesa el doble porque la entrega es el
domingo.

| Dirección | Relevancia | Diferenciación | Viabilidad científica | Demostrable en 48 h ×2 | Total | Lectura |
|---|:-:|:-:|:-:|:-:|:-:|---|
| **A. Flipbook que mide** (movimiento medido frente a Gaia) | 5 | 5 | 4 | 4 (8) | **22** | Reutiliza el apilado sobre los cuadros ya descargados. **Recomendada.** |
| B. Ciencia ciudadana con movimientos inyectados | 4 | 2 | 4 | 3 (6) | 16 | SkyShift ya lo hace. |
| C. Explorador espectral de 102 bandas | 3 | 3 | 4 | 3 (6) | 16 | Bueno como complemento (C3), no como núcleo: no habla del cambio en el tiempo. |
| D. Línea de tiempo multimisión (SPHEREx, NEOSSat, WISE, Gaia) | 3 | 4 | 2 | 2 (4) | 13 | NEOSSat no cubre todo el cielo y observa en otra banda. |
| E. Detección automática de anomalías (ML) | 2 | 3 | 1 | 1 (2) | 8 | Sin catálogo ni etiquetas; además, el desafío pide asistir al ojo, no reemplazarlo. |
| F. Asistente conversacional (LLM) | 1 | 1 | 1 | 3 (6) | 9 | Marketing. Los rivales ya tienen chatbots. |

## 9. Evaluación crítica como jurado

**Rúbrica oficial 2026.**

- Cinco criterios puntuados de 1 a 5: Impacto, Creatividad, Validez, Relevancia y Presentación.
- La mayor parte de la evaluación se basa en el enlace al proyecto.
- La Relevancia exige que los datos de NASA sean "un componente central y no un agregado superficial".

| Criterio | Hoy | Tras el plan | Por qué |
|---|:-:|:-:|---|
| Impacto | 3 | 4 | La herramienta sirve, pero no demostramos que alguien sin formación descubra algo. |
| Creatividad | 3 | 5 | Hoy es un visor bien hecho más; la medición contrastada es lo que nadie trae. |
| Validez | 4 | 5 | Procesamiento correcto y honesto; restan las páginas vacías y el "Copilot". |
| Relevancia | 4 | 5 | Responde exactamente al enunciado; las páginas fuera de foco lo diluyen. |
| Presentación | 2 | 4 | La portada no nombra el desafío y no hay video de 30 s. |

### Motivos por los que nos rechazarían hoy

1. "Es otro visor de recortes": parpadeo y diferencia ya los tienen otros equipos.
2. "¿Qué midieron ustedes?": la frase de movimiento sale del catálogo.
3. Abren Candidatos o Descubrimientos y ven una página vacía. Abren Cielo vivo y el botón principal los deja en un buscador vacío.
4. Escriben una pregunta en "Copilot" y reciben un texto genérico.
5. El video de la entrega dura más de 30 s y queda fuera de la evaluación global.

## 10. Propuesta de producto

- **Nombre:** The Origin Project · SPHEREx Time Explorer.
- **Una frase:** escribís una coordenada, ves el cielo infrarrojo de SPHEREx cambiar como un video y la herramienta te dice cuánto cambió, medido en esas imágenes y comparado con lo publicado.
- **Problema:** SPHEREx publica cada semana más imágenes de las que cualquiera puede revisar, y cada exposición está en otro color. No hay una herramienta pública que muestre los cambios en el tiempo, los separe del color y los cuantifique.
- **Usuarios:**
  - voluntarios de ciencia ciudadana (estilo Backyard Worlds);
  - docentes y estudiantes;
  - astrónomos que quieren un vistazo rápido antes de bajar datos.
- **Por qué merece ganar:** cumple el enunciado entero y agrega lo que nadie trae: resultados medidos con SPHEREx que cualquiera puede comprobar contra Gaia y la literatura.

### Recorrido principal (Core Experience)

1. La portada muestra el titular del desafío y los cinco objetivos: un clic lleva al video.
2. El video arranca en menos de 10 s. Arriba aparece la tarjeta de resultado: "Medido en SPHEREx: 10,3 ± 0,4″/año · Gaia DR3: 10,4″/año" (son números de ejemplo; se reemplazan por los medidos).
3. Controles de WiseView: parpadeo, antes/después y diferencia con A.
4. En las variables, la curva de luz a longitud de onda constante, con su incertidumbre y el tipo de variable publicado al lado (sin período ajustado).
5. Para profundizar, en paneles plegados: espectro al vuelo, mapa Aladin, cobertura NEOSSat y modo Planeta X (apilado).

## 11. Funcionalidades prioritarias

**Must have**

- Despliegue de lo de hoy y caché caliente DR1 de los cinco objetivos.
- Movimiento medido frente a Gaia: Barnard, ε Indi B y WISE 0855 con su incertidumbre.
- Curvas de las variables con el filtro de longitud de onda aplicado sobre los cuadros ya bajados, mostrando la incertidumbre.
- Navegación reducida a Observatorio, Explorador y Demo.
- Video de 30 s y 7 diapositivas.

**Should have**

- Caché de Gaia por objetivo, para resistir el error 429.
- Espectro al vuelo dentro del explorador (C3).
- Portada de una sola pantalla con el titular del desafío.
- Prueba con 3 personas sin formación (R5) y su tabla en `docs/demo.md`.

**Could have**

- Suma por detector visible en el modo normal (C2).
- Línea "mismo color" sobre los cuadros.
- Etiquetado de asteroides conocidos con SkyBoT en el video.

**Won't have (ocultar o quitar)**

- Cielo vivo y su "Copilot".
- Descubrimientos (duplicado) y Candidatos con almacén global.
- "Perfil espacial" del laboratorio espectral.
- Diario y login.
- Cualquier chatbot o ML de detección.

## 12. Arquitectura recomendada

Mantener la actual, que es del tamaño correcto: Next.js en Vercel, FastAPI en
Railway, caché de secuencias en almacenamiento y trabajos en segundo plano. No
hace falta tecnología nueva. Los cambios son de alcance, no de estructura:

- **Sin descargas ni almacenamiento nuevos.** Todo lo nuevo se calcula sobre los cuadros que ya se bajan para el video.
- **Servicio de "resultado medido"** que reutilice `shift_stack.py` (ajuste de velocidad). Devuelve medición, incertidumbre, valor de referencia de Gaia y fuente.
- **Caché de Gaia por campo**, con tiempo de vida largo y precalentada para los cinco objetivos.
- **Ocultar funcionalidades con una bandera** en lugar de borrarlas, para no romper dependencias a 48 h de la entrega.

## 13. Roadmap de implementación (48 h)

| Fase | Tarea | Archivos | Criterio de aceptación | Verificación |
|---|---|---|---|---|
| 1 · Crítico (hoy, 3 h) | Desplegar y calentar caché DR1 y Gaia | Railway, Vercel | `/sky/neossat` responde; los 5 videos salen en < 10 s | curl contra producción y e2e contra la URL pública |
| | Reducir la navegación a tres páginas | `(app)/layout.tsx`, sidebar | Ningún enlace lleva a una página vacía o rota | e2e de navegación |
| | Etiquetar o reemplazar las curvas de las tarjetas | `TargetCurve.tsx` | Dicen "ilustración" o muestran datos reales | Revisión visual |
| 2 · Ciencia (4–6 h) | Movimiento medido por ajuste de velocidad del apilado, sobre los cuadros del video | `shift_stack.py`, servicio nuevo | Barnard y ε Indi B dentro de 2σ de Gaia; WISE 0855 informado con su incertidumbre; el video sigue saliendo en < 15 s | pytest sintético y corrida real de los tres |
| | Curvas de las variables: filtro de longitud de onda sobre los cuadros ya bajados e incertidumbre visible | `routers/sequences.py`, `LightCurve.tsx` | Sin descargas extra; la nota de estrellas de comparación deja de contradecirse | pytest y corrida real de RW Aur y R Dra |
| 3 · Diferencial (4 h) | Tarjeta "Medido frente a publicado" | `time-explorer/page.tsx`, componente nuevo | Muestra medición, referencia, diferencia y fuente enlazada | e2e en los cinco objetivos |
| 4 · Experiencia (4 h) | Portada de una pantalla con el titular del desafío; espectro dentro del explorador | `(landing)`, `SpectrumPanel.tsx` | Del primer clic al video, ≤ 2 clics | Prueba con 3 personas y tabla en `docs/demo.md` |
| 5 · Demo (3 h) | Video de 30 s y 7 diapositivas | — | ≤ 30 s, enlace público, marca de agua si hay imágenes generadas con IA | Revisión del equipo |
| 6 · Documentación (2 h) | Texto de entrega, declaración de uso de IA, README | `README.md`, formulario | Campos del formulario completos | Lista de la guía oficial |

Si la medición de movimiento no es confiable el sábado a la noche, se presenta
el apilado como evidencia, que ya es real y significativo, y se recorta la
tarjeta. No se presenta un número que no se midió.

## 14. Guion de demostración

### Video oficial de 30 segundos

| Tiempo | Contenido |
|---|---|
| 0–5 s | "SPHEREx mapea el cielo en 102 colores. ¿Qué cambió?" Se escriben las coordenadas de WISE 0855 y arranca el video. |
| 5–13 s | Barnard: parpadeo y diferencia; la estrella se corre. Tarjeta "Medido en SPHEREx frente a Gaia DR3". |
| 13–22 s | R Draconis: el brillo cambia en la misma escala y a la misma longitud de onda; la curva lo muestra. |
| 22–30 s | WISE 0855: invisible cuadro a cuadro, aparece al apilar siguiendo su movimiento. "Así se buscaría un Planeta X." Enlace al sitio. |

### Presentación en vivo de 3 minutos (evento local)

| Minuto | Contenido |
|---|---|
| 0:00 | El problema: miles de imágenes por semana, cada una en otro color. Buscar cambios a ojo mezcla tiempo y color. |
| 0:30 | En vivo desde la portada: un clic a Barnard, el video, el parpadeo, la diferencia y la tarjeta medida frente a Gaia. |
| 1:15 | R Draconis y RW Aurigae: el cambio de brillo en una escala común y a la misma longitud de onda, con su incertidumbre. |
| 1:50 | WISE 0855 y el apilado: de "no se ve" a "está donde predice el catálogo", con p < 0,001. |
| 2:30 | Honestidad y recursos usados: DR1, Gaia, WISE, NEOSSat/CADC, y lo que la herramienta no hace. Cierre: cómo escala con DR2 y con el catálogo de 2027. |

### Preguntas difíciles

- **"Si el movimiento es menor que un píxel, ¿cómo lo ven?"** Con un año de base el corrimiento es de 1 a 2 píxeles. Además medimos apilando sobre una grilla de velocidades, que aprovecha todas las épocas a la vez.
- **"¿El cambio de brillo no es el cambio de color?"** Solo comparamos cuadros que están dentro de ±0,06 µm y en el mismo detector, y la app lo muestra.
- **"¿Usan IA?"** No en el producto, porque no hay un caso de uso que la justifique. Sí la usamos para escribir código, y lo declaramos como pide Space Apps.
- **"¿Qué pasa si IRSA se cae?"** Se sirve el último resultado real con su fecha, y la pantalla lo avisa.

## 15. Riesgos y puntos que pueden hacernos perder

| Riesgo | Severidad | Mitigación |
|---|---|---|
| El video de entrega supera 30 s | ❌ Saca el proyecto de la evaluación global | Cronometrarlo y dejarlo en 28 s. |
| Uso de IA sin declarar | ❌ Alta | Declararlo en el formulario. La guía también pide que la IA no genere la idea: el equipo decide qué partes de esta propuesta adopta y lo declara. |
| Gaia limita los pedidos (429) durante la demo | ⚠️ Media | Caché por objetivo, precalentada. |
| Caché fría: la demo tarda minutos | ⚠️ Media | Calentar los cinco objetivos después de cada despliegue. |
| La medición de movimiento no es confiable en WISE 0855 (señal débil) | ⚠️ Media | Mostrarla con su incertidumbre o solo el apilado; nunca forzar un número. |
| El sitio está bloqueado en la red del jurado | ⚠️ Media | Clasificar el dominio en FortiGuard, como recomienda la guía. |
| CDS caído (capas Gaia/WISE de Aladin, enlaces a SIMBAD) | ℹ️ Baja | El fondo ya es SPHEREx DR1 servido por IRSA, y las capas avisan si fallan. |
| Candidatos globales visibles para todos | ⚠️ Media | Ocultar la página y no permitir que la verificación escriba sin autenticación. |

## 16. Veredicto final

| Pregunta | Respuesta |
|---|---|
| ¿En qué nivel estamos? | Producto técnico sólido y honesto, con el núcleo completo. La experiencia está dispersa y no hay un resultado propio. |
| ¿Qué tan competitivos somos? | Por encima de la media de los rivales públicos en rigor; empatados o por debajo en presentación. Hoy somos candidatos a nominación local, no a premio global. |
| ¿Qué nos falta para destacar? | Un número medido por nosotros que coincida con la literatura, y un video de 30 s que lo muestre. |
| ¿Qué eliminar? | Cielo vivo, Copilot, Descubrimientos, Candidatos, el perfil espacial, el Diario y el login de la navegación pública. |
| ¿Qué construir ya? | Desplegar y calentar la caché; el movimiento medido frente a Gaia sobre los cuadros del video; la tarjeta de resultado. |
| ¿Mejor oportunidad? | "El flipbook que mide": la única entrada que, además de mostrar el cambio, lo cuantifica con SPHEREx y lo contrasta con Gaia, en segundos y para cualquier coordenada. |

---

**Fuentes principales.**

- Space Apps 2026: página del desafío Planet X and SPHEREx, guía de entrega y guía de evaluación.
- IRSA SPHEREx: página de la misión, notebooks, ayuda de búsqueda y MOST.
- DataCite: DOI de DR1, 10.26131/IRSA678.
- CADC NEOSSat y archivo Gaia de ESA.
- JPL, sobre Backyard Worlds.
- Zenodo 10.5281/zenodo.23193726 (SkyShift).
- Mediciones propias: backend de producción y CADC en vivo, 13 de noviembre de 2026.

**Sin verificar.**

- Los controles exactos de WiseView (el sitio no respondió).
- Los valores de SIMBAD y del GCVS: confirmarlos antes de mostrarlos.
- El nombre del décimo premio global.
