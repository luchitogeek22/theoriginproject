# Contrato API v1 — resumen

Base: `{backend}/api/v1`. Errores: `{ "detail": "…" }` + `X-Request-ID`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | latido |
| GET | `/data-sources/status` | probe en vivo de IRSA SIA2 |
| GET/POST | `/targets/resolve` | SIMBAD / manual / WISE 0855 fijado |
| POST | `/observations/search` | SIA2 por cono + tiempo + colección |
| GET | `/observations/{id}` | metadatos persistidos |
| POST | `/cutouts` | recorte espacial + resumen FITS |
| GET | `/cutouts/{id}/preview.png` | PNG (percentiles 1–99, solo visual) |
| GET | `/cutouts/{id}/download` | FITS original del recorte |
| POST | `/analysis/temporal` | job A/B con astrometría |
| POST | `/analysis/differential` | job A−B alineado + detecciones |
| POST | `/analysis/spectral` | job de perfil espectral |
| GET | `/jobs/{id}` | estado del job |
| GET | `/jobs/{id}/results` | resultado (mediciones + limitaciones) |
| GET | `/jobs/{id}/artifact/{n}.png` | a_png / b_png / diff_png |
| GET | `/candidates` | candidatos medidos (?limit) |
| POST/GET | `/research`, `/research/{id}` | journal reproducible (incluye `verification_hash` SHA-256) |
| GET | `/research/{id}/verify` | recalcula el hash y compara con el registrado (`match`) |
| GET | `/evidence/{id}/report?format=` | json / markdown / csv / pdf, siempre como descarga `attachment` (`research-<objetivo>.<ext>`); formato desconocido → 422 |
| GET | `/sky/reference-stars` | estrellas de referencia J2000 |

Contrato completo y ejecutable: `{backend}/docs` (OpenAPI).
Tipos espejo en frontend: `frontend/lib/types.ts`.

Autenticación: la exploración y el análisis son públicos. `/analysis/*` acepta
peticiones anónimas (`user_id` nulo); si se envía `Authorization: Bearer
<jwt-supabase>` debe ser válido (401 si no) y su `sub` se asocia como `user_id`.
Solo guardar en el diario, `POST /research`, exige un token válido cuando
`SUPABASE_JWT_SECRET` está configurado. Sin configurar, todo acepta peticiones
anónimas.
