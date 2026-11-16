# The Origin Project — monorepo

## Estructura

- `frontend/` — Next.js + React + TypeScript + Three.js (React Three Fiber).
- `backend/` — FastAPI + Astropy: gateway SIA2, procesamiento FITS, motores temporal/espectral.
- `docs/` — Arquitectura, despliegue y contrato API.
- `docker-compose.yml` — Desarrollo local con Postgres, Redis y MinIO (S3 compatible).

## Arranque rápido (desarrollo local)

### 1. Backend científico (Python)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy ..\.env.example ..\.env
uvicorn app.main:app --reload --port 8000
```

API: http://localhost:8000/api/v1/health — OpenAPI: http://localhost:8000/docs

### 2. Frontend (Next.js)

```powershell
cd frontend
npm install
npm run dev
```

App: http://localhost:3000

### 3. Todo con Docker

```powershell
docker compose up --build
```

## Autenticación (opcional, Supabase)

1. Crea un proyecto en Supabase y habilita Email Auth.
2. Copia `.env.example` a `.env` y completa `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` (también como `NEXT_PUBLIC_*` para el frontend)
   y `SUPABASE_JWT_SECRET` (Dashboard > Settings > API, solo backend).
3. Reinicia ambos servicios.

Con Supabase configurado, `/time-explorer`, `/journal` y `/discoveries`
exigen sesión y cada investigación/candidato guarda el `user_id` del token
JWT (extraído en servidor, nunca desde el cliente). Sin configurar, la app
funciona en modo anónimo e indica que no hay login disponible.

## Datos de la NASA utilizados

* Imágenes espectrales calibradas de SPHEREx (FITS, Nivel 2), obtenidas del NASA/IPAC Infrared Science Archive (IRSA). Colecciones públicas: spherex_dr1, spherex_dr1_deep, spherex_qr3 y spherex_qr3_deep.
* Catálogo de observaciones de SPHEREx, consultado mediante los protocolos IVOA SIA2 y TAP (tabla spherex.obscore) del IRSA: coordenadas celestes, fecha de observación, detector, banda espectral y enlace de descarga (access_url). DOIs: DR1, 10.26131/IRSA678; QR3, 10.26131/IRSA662.
* Mosaicos de referencia WISE/AllWISE (FITS): coadds del AllWISE Atlas en las bandas W1 y W2, descargados del IRSA Image Server (IBE), usados como capa de referencia espacial.
* Índice de mosaicos WISE/AllWISE: coadd_id, bandas infrarrojas y tiempo medio de observación (mid_obs), obtenidos vía IBE.

## Datos de agencias socias y otras fuentes abiertas (no NASA)

* Cobertura de NEOSSat (Agencia Espacial Canadiense), consultada por el servicio TAP del CADC (CAOM2).
* SIMBAD para resolver nombres de objetos a coordenadas.

## Regla de datos

La aplicación solo muestra datos reales de archivos públicos: observaciones de SPHEREx y mosaicos WISE/AllWISE del NASA/IPAC IRSA, y cobertura de NEOSSat del CADC.
Si el archivo no responde o no hay cobertura, la interfaz lo comunica
explícitamente. Nunca se inventan observaciones, espectros ni detecciones.

Proyecto educativo independiente. No es un producto oficial de NASA
ni implica respaldo institucional.
