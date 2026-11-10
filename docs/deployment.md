# Despliegue — THE ORIGIN PROJECT

## Desarrollo local (sin Docker)

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy ..\.env.example ..\.env
uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Abrir http://localhost:3000 (usa `NEXT_PUBLIC_API_URL`, defecto http://localhost:8000).

## Docker Compose

```powershell
copy .env.example .env
docker compose up --build
```

Servicios: `frontend:3000`, `backend:8000`, `postgres:5432`, `redis:6379`,
`minio:9000` (consola `:9001`). El backend usa Postgres/Redis automáticamente
vía variables de entorno del compose.

## Variables críticas

| Variable | Efecto |
|---|---|
| `DATABASE_URL` | `sqlite:///./data/origin.db` (defecto) o `postgresql+psycopg2://…` |
| `REDIS_URL` | vacío = caché en memoria; `redis://…` = caché compartida |
| `STORAGE_BACKEND` | `local` (defecto) o `s3` (MinIO o compatible) |
| `IRSA_*` | endpoint SIA2, colecciones, timeouts, MAXREC, límite de descarga |
| `NEXT_PUBLIC_API_URL` | URL del backend vista desde el navegador |

## Producción (cloud)

- Backend: cualquier contenedor Python 3.11+ (2 vCPU / 4 GB mínimo por
  worker científico); `DATABASE_URL` a Postgres gestionado; `REDIS_URL`
  gestionado; `STORAGE_BACKEND=s3` con bucket y credenciales.
- Frontend: `npm run build` + `npm start`, o exportar tras `next build`
  en la plataforma elegida, con `NEXT_PUBLIC_API_URL` apuntando al backend.
- Observabilidad: logs JSON a stdout (`LOG_LEVEL`), `X-Request-ID` en cada
  respuesta, `/api/v1/health` para probes, OpenAPI en `/docs`.
- Seguridad: `CORS_ORIGINS` restringido al dominio del frontend; límites de
  descarga y rate-limit activos por defecto; sin credenciales en el repo.
