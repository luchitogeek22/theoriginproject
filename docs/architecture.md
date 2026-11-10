# Arquitectura — THE ORIGIN PROJECT

## Componentes

```
Browser (Next.js 14 + React 18 + R3F)
  │  REST /api/v1  (NEXT_PUBLIC_API_URL)
  ▼
FastAPI (app/main.py)
  ├─ routers/system      /health, /data-sources/status (probe en vivo)
  ├─ routers/targets     resolución SIMBAD (+ WISE 0855 fijado por spec)
  ├─ routers/observations búsqueda SIA2 → persistencia de metadatos
  ├─ routers/cutouts     recortes + resumen FITS + PNG de previsualización
  ├─ routers/analysis    jobs temporal/diferencial/espectral + candidatos
  ├─ routers/research    journal + informes de evidencia (JSON/PDF/CSV/MD)
  └─ routers/sky         estrellas de referencia (catálogo J2000)
  ▼
Servicios (app/services)
  ├─ sia2_gateway   PyVO SIA2 con fallback HTTP documentado; caché TTL
  ├─ targets        astroquery SIMBAD; coordenadas manuales siempre posibles
  ├─ fits_processing astropy: HDU 1-6, WCS, FLAGS, VARIANCE, WCS-WAVE, PNG
  ├─ temporal       reproject + background match + diferencia + photutils
  ├─ spectral       perfil por apertura vs WCS-WAVE (grado visualización)
  ├─ jobs           BackgroundTasks + tabla analysis_jobs (polling)
  ├─ evidence       informe con DOI QR2/QR3 + reconocimiento SPHEREx/IRSA
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
