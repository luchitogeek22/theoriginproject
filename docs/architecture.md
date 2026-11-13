# Arquitectura — THE ORIGIN PROJECT

## Componentes

```
Browser (Next.js 14 + React 18 + R3F)
  │  REST /api/v1  (NEXT_PUBLIC_API_URL)
  ▼
FastAPI (app/main.py)
  ├─ routers/system      /health (consulta la base), /data-sources/status (probe en vivo)
  ├─ routers/targets     resolución SIMBAD (+ WISE 0855 fijado por spec)
  ├─ routers/observations búsqueda SIA2 → persistencia de metadatos
  ├─ routers/cutouts     recortes + resumen FITS + PNG de previsualización
  ├─ routers/analysis    jobs temporal/diferencial/espectral + candidatos
  ├─ routers/sequences   secuencia tipo video + apilado con desplazamiento (modo Planeta X) + cuadros PNG
  ├─ routers/spectra     espectrofotometría relativa al vuelo + termómetro de color
  ├─ routers/research    journal + informes de evidencia (JSON/PDF/CSV/MD)
  └─ routers/sky         estrellas de referencia (catálogo J2000)
  ▼
Servicios (app/services)
  ├─ sia2_gateway   SIA2 por HTTP (httpx) con plazos, reintento acotado y caché completa; colecciones descubiertas por TAP
  ├─ targets        astroquery SIMBAD; coordenadas manuales siempre posibles
  ├─ spherex_product lector de productos por EXTNAME: WCS con SIP, WCS-WAVE (clave W), máscara de calidad
  ├─ fits_processing resumen y vista previa sobre el lector
  ├─ temporal       reproject + background match + diferencia + photutils
  ├─ spectral       perfil por apertura vs WCS-WAVE (grado visualización)
  ├─ jobs           BackgroundTasks + tabla analysis_jobs (polling)
  ├─ evidence       informe con DOI QR2/QR3 + reconocimiento SPHEREx/IRSA;
  │                 hash SHA-256 versión 2 sobre todo el contenido
  ├─ sequence       motor de secuencia (cuadros por fecha, escala común) y suma ponderada
  ├─ shift_stack    búsqueda de movimiento lento con corrección por búsqueda múltiple
  ├─ photometry     fotometría de apertura y curva de luz relativa
  ├─ catalogs       Gaia DR3 y SkyBoT (plazo total, caché)
  ├─ vetting        siete comprobaciones y categoría de un candidato
  ├─ reference_epoch cuadro AllWISE W1/W2 de referencia (nunca se resta)
  └─ store          caché (Redis o memoria) + blobs (S3 o disco local)
  ▼
Persistencia: SQLite local (defecto) o Postgres (compose); Redis opcional.
```

## Decisiones clave

- **Un solo backend (Python).** Next.js solo sirve el frontend; todo lo
  científico vive en FastAPI. Sin segunda capa Node.
- **Datos reales o nada.** Sin fixtures en la app; estados honestos
  (sin cobertura, archivo caído, datos insuficientes). Caché etiquetada
  con fecha y procedencia.
- **Trazabilidad.** Cada fila calculada referencia sus observaciones;
  cada resultado declara OBSERVED/PROCESSED/COMPUTED/PRELIMINARY.
- **Trabajo pesado en background.** Descargas FITS y análisis corren en
  jobs con polling; la UI nunca se bloquea.
- **3D = direcciones.** La esfera celeste representa RA/DEC sobre una
  esfera unitaria (`frontend/lib/coords.ts`, única fuente). Sin distancias
  inventadas; la geometría decorativa no existe: todo marcador proviene
  de datos, salvo la capa etiquetada de estrellas de referencia.
- **Detectores ≠ bandas.** El motor temporal rechaza comparar detectores
  distintos y advierte sobre productos espectrales diferentes.
- **SPHEREx:** colecciones QR3 (+deep) como fuente principal, QR2 (+deep)
  como complemento. QR1 no se usa (retirado del archivo público).
- **Observabilidad.** Cada petición deja una línea JSON con `request_id`,
  método, ruta, estado y `duration_ms`; el mismo identificador vuelve en
  `X-Request-ID`. Cada etapa de un job registra su duración (`job_id`,
  `stage`, `duration_ms`). `/api/v1/health` devuelve 503 si la base no responde.
- **Entrada acotada.** CORS es la capa más externa (también en 429/413/500),
  los cuerpos mayores de 1 MB se rechazan, el límite por cliente usa el último
  salto de `X-Forwarded-For` y se compacta con gzip.
