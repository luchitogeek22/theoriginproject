# Contrato API v1 — resumen

Base: `{backend}/api/v1`. Errores: `{ "detail": "…" }` + `X-Request-ID`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | latido que consulta la base: 200 `{status, version, environment, database}`; 503 `{status: "degraded", database: "unreachable"}` si la base no responde. No cuenta para el límite de peticiones |
| GET | `/data-sources/status` | probe en vivo de IRSA SIA2 y entregas en uso (`collections`: `used`, `source` `irsa`\|`configured`, `checked_at`). Las colecciones se descubren por TAP (`spherex.obscore`, consulta de ~1 min en segundo plano, caché de 24 h); mientras no se sabe, o si IRSA no responde, se usa la lista configurada |
| GET/POST | `/targets/resolve` | los 5 objetivos del desafío sin red, coordenadas en texto libre (decimal o sexagesimal) o SIMBAD. Devuelve la posición J2000 de catálogo y la propagada con movimiento propio a `obstime` (por defecto hoy). Solo el POST guarda una fila |
| POST | `/observations/search` | SIA2 por cono + tiempo + colección. Un ítem es un producto (`product_id`, un detector 1-6); una exposición trae hasta 6. Colección fuera de la lista configurada → 422; archivo caído → 502; `warnings` avisa de colecciones fallidas o de `maxrec` alcanzado |
| GET | `/observations/{id}` | metadatos persistidos |
| POST | `/cutouts` | recorte vía `?center=RA,Dec&size=<grados>` de IRSA + resumen FITS. Idempotente por observación, posición, tamaño y `PROCESSING_VERSION`; si el blob falta se vuelve a bajar. Sin respaldo de archivo completo: fallo → 502, tamaño sobre el tope (64 MB) → 413 |
| GET | `/cutouts/{id}/preview.png` | PNG (percentiles 1–99, solo visual), `Cache-Control: public, max-age=31536000, immutable` |
| GET | `/cutouts/{id}/download` | FITS original del recorte |
| POST | `/sequences` | secuencia tipo video de un trozo de cielo, anónima. Body: `ra_deg`, `dec_deg`, `size_arcmin` (1-60, def. 6), `mode` (`motion`\|`brightness`), `detector` (1-6, opcional), `max_frames` (1-24, def. 12). Devuelve `job_id`; `GET /jobs/{id}/results` entrega `frames[]` (`index`, `obs_id`, `collection`, `t_mid_mjd`, `date_iso`, `detector`, `wavelength_um`, `png_url`, `flagged_fraction`, `coverage_fraction`), `scale` (`mode`, `lo`, `hi`, `unit`), `grid`, `n_available`, `n_used`, `limitations[]`, `processing_version`, `key`, más `lightcurve` (`relative`, `label`, `points[]` con `value`, `err`, `flagged`, `used`, `comparison_scatter`, `n_comparisons`), `overlay` (`target[]` y `gaia[].positions[]` en píxeles de pantalla `x`,`y` por `index`, `uncertainty_px`, `displacement_arcsec`, `fov_hint`, `gaia_available`) y, si `include_reference`, `reference` (`png_url`, `label`, `band`, `epoch_iso`). Si IRSA no responde y existe una secuencia real previa para la misma petición, el job completa con ese resultado y `served_from_cache: true`, `queried_at` y `cache_label` (nunca datos sintéticos). Opcionales del body: `pm_ra_mas_yr`, `pm_dec_mas_yr`, `parallax_mas`, `ref_epoch`, `include_reference`; los cinco objetivos del desafío traen su movimiento propio sin enviarlo. Un solo detector por secuencia; cuadros por fecha ascendente; resultado reutilizado si la petición se repite |
| POST | `/sequences/shift-stack` | búsqueda por apilado con desplazamiento ("modo Planeta X"). Body: `ra_deg`, `dec_deg`, `size_arcmin` (def. 4), `detector`, `max_frames` (3-24), `max_speed_arcsec_yr` (def. 80), `steps` (def. 11). Job; resultado: `ok`, `n_visits`, `velocity_axis_arcsec_yr`, `significance_map[iy][ix]` (iy = velocidad norte, ix = velocidad este), `best` (`v_east_arcsec_yr`, `v_north_arcsec_yr`, `x`, `y`, `sigma_raw`, `sigma_corrected`, `p_value_corrected`, `n_trials`, `detected`), `threshold_sigma`, `stack_png_url`, `limitations[]`. Con menos de 3 visitas `ok` es falso y no hay resultado. La significancia corregida penaliza la búsqueda múltiple |
| GET | `/sequences/{key}/stack.png`, `/sequences/{key}/reference.png` | imagen apilada / cuadro WISE de referencia (inmutables) |
| POST | `/spectra` | espectrofotometría relativa al vuelo. Body: `ra_deg`, `dec_deg`, `size_arcmin` (def. 3), `per_detector` (1-8). Job; resultado: `label` ("relative spectrophotometry, no aperture correction"), `points[]` (`mjd`, `date_iso`, `detector`, `wavelength_um`, `bandwidth_um`, `flux_jy`, `flux_jy_err`, `snr`, `flagged`), `color` (`available`, `index` en [-1, 1], `index_err`, `short`, `long`, `reading`, `reference_note`), `limitations[]` |
| POST | `/analysis/vet` | body `{candidate_id}`; siete comprobaciones y una categoría (`known_object`, `artifact_likely`, `unexplained_candidate`, `inconclusive`) guardadas en la evidencia del candidato; una comprobación que no pudo ejecutarse figura `not_checked` y nunca vuelve "sin explicar" a un candidato |
| GET | `/sequences/{key}/frames/{i}.png` | cuadro renderizado (norte arriba, este a la izquierda), `Cache-Control: immutable` |
| POST | `/analysis/temporal` | job A/B con astrometría |
| POST | `/analysis/differential` | job A−B alineado + detecciones |
| POST | `/analysis/spectral` | job de perfil espectral |
| GET | `/jobs/{id}` | estado del job (`stage`, `done`, `total`). Una creación idéntica a un job en cola o en ejecución devuelve ese `job_id`; con la cola llena la creación responde 429. Al reiniciar, los jobs pendientes pasan a `failed` ("interrupted by restart"). `error` es un mensaje estable, sin rutas ni nombres de excepción |
| GET | `/jobs/{id}/results` | resultado (mediciones + limitaciones) |
| GET | `/jobs/{id}/artifact/{n}.png` | a_png / b_png / diff_png |
| GET | `/candidates` | candidatos medidos, sin `user_id` (`?limit` entre 1 y 200, def. 100; fuera de rango → 422) |
| POST/GET | `/research`, `/research/{id}` | journal reproducible (incluye `verification_hash` SHA-256 y `hash_version`; sin `user_id`). Límites: `title` 256 caracteres, `payload` 256 KB, listas de 200 elementos, `observations`/`candidates`/`cutouts` solo objetos → 422 |
| GET | `/research/{id}/verify` | recalcula el hash y compara con el registrado (`match`). Los registros nuevos usan `hash_version` 2 (JSON canónico de título, objetivo, coordenadas y todo el `payload`, incluidos `processing_version` y los SHA-256 de los recortes); los anteriores se verifican con la versión 1 y no se reescriben |
| GET | `/evidence/{id}/report?format=` | json / markdown / csv / pdf, siempre como descarga `attachment` (`research-<objetivo>.<ext>`); formato desconocido → 422. `integrity.covers` enumera lo que cubre el hash; en CSV las celdas que empiezan por `=`, `+`, `-`, `@`, tabulador o retorno de carro llevan un apóstrofo inicial |
| GET | `/sky/reference-stars` | estrellas de referencia J2000 |
| GET | `/sky/neossat?ra=&dec=` | cobertura NEOSSat (CSA) en CADC dentro de 0,25°: cantidad, primera y última fecha, enlace; 503 si CADC no responde |

Contrato completo y ejecutable: `{backend}/docs` (OpenAPI; desactivado cuando `ENVIRONMENT=production`).
Tipos espejo en frontend: `frontend/lib/types.ts`.

Autenticación: la exploración y el análisis son públicos. `/analysis/*` acepta
peticiones anónimas (`user_id` nulo); si se envía `Authorization: Bearer
<jwt-supabase>` debe ser válido (401 si no) y su `sub` se asocia como `user_id`.
Solo guardar en el diario, `POST /research`, exige un token válido cuando
`SUPABASE_JWT_SECRET` está configurado. Sin configurar, todo acepta peticiones
anónimas.

Límites de entrada: cuerpos de más de 1 MB → 413 `{ "detail": "Request body too
large (limit 1 MB)." }`; más de `RATE_LIMIT_PER_MINUTE` peticiones por minuto y
cliente → 429. El cliente se identifica por el último salto de
`X-Forwarded-For` (`TRUSTED_PROXY_HOPS`, defecto 1; 0 usa la IP del socket).
Los preflight `OPTIONS` y `/health` no consumen cuota. Los tokens se validan
con `aud` (`SUPABASE_JWT_AUDIENCE`, defecto `authenticated`) e `iss`
(`{SUPABASE_URL}/auth/v1`). Las respuestas se comprimen con gzip.
