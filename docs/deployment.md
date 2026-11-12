# Despliegue — THE ORIGIN PROJECT

## Desarrollo local (sin Docker)

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
copy ..\.env.example ..\.env
uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd frontend
npm ci
npm run dev
```

Abrir http://localhost:3000 (usa `NEXT_PUBLIC_API_URL`, defecto http://localhost:8000).

## Docker Compose

```powershell
copy .env.example .env
docker compose up --build
```

Servicios (puertos ligados a `127.0.0.1`): `frontend:3000`, `backend:8000`,
`postgres:5432`, `redis:6379`, `minio:9000` (consola `:9001`). El backend usa Postgres/Redis automáticamente
vía variables de entorno del compose.

## Variables críticas

| Variable | Efecto |
|---|---|
| `DATABASE_URL` | `sqlite:///./data/origin.db` (defecto) o `postgresql+psycopg2://…` |
| `REDIS_URL` | vacío = caché en memoria; `redis://…` = caché compartida |
| `STORAGE_BACKEND` | `local` (defecto) o `s3` (MinIO o compatible) |
| `IRSA_*` | endpoint SIA2, colecciones, timeouts, MAXREC, límite de descarga |
| `NEXT_PUBLIC_API_URL` | URL del backend vista desde el navegador (en Docker es un argumento de build) |
| `TRUSTED_PROXY_HOPS` | saltos de proxy confiables para `X-Forwarded-For` (defecto 1: se usa el último valor; 0 usa la IP del socket) |
| `RATE_LIMIT_PER_MINUTE` | peticiones por minuto y cliente (defecto 120) |
| `SUPABASE_JWT_AUDIENCE` | `aud` exigido en los tokens (defecto `authenticated`) |

## Producción (cloud)

Stack actual: backend en Render, frontend en Vercel, Postgres/Auth en
Supabase. El pipeline [deploy.yml](../.github/workflows/deploy.yml)
despliega frontend + base de datos tras cada CI verde en `main`; el
backend se despliega una vez vía Blueprint y luego auto-despliega con
cada push a `main` (comportamiento por defecto de Render).

### 1. Backend en Render (solo la primera vez, desde el dashboard)

1. Render Dashboard > New > Blueprint > repositorio
   `luchitogeek22/theoriginproject` (usa [render.yaml](../render.yaml)).
2. Completar los secretos (`sync: false`):
   - `DATABASE_URL`: pooler Supabase en **session mode** (puerto 5432),
     formato `postgresql://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres`.
     El modo transacción (6543) rompe la creación de esquema y el host
     directo `db.*` es solo IPv6. Si la contraseña tiene caracteres
     especiales, codificarla para URL.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`: Dashboard Supabase > Settings > API.
   - `SUPABASE_JWT_SECRET`: misma página, solo backend, secreto.
3. Deploy. Las tablas se crean solas en el primer arranque (`init_db`
   + migración ligera de columnas); no hay carpeta `supabase/migrations`.
4. Verificar: `https://<servicio>.onrender.com/api/v1/health` responde
   `{"status":"ok","version":"1.0.0","environment":"production","database":"ok"}`
   (503 con `"status":"degraded"` si la base no responde).
5. En el primer despliegue, registrar un log temporal del encabezado
   `X-Forwarded-For` recibido y confirmar que la plataforma añade la IP del
   cliente como último valor; si no, ajustar `TRUSTED_PROXY_HOPS`.

### 2. Conectar el frontend (Vercel) al backend

1. Vercel Dashboard > proyecto > Settings > Environment Variables:
   `NEXT_PUBLIC_API_URL=https://<servicio>.onrender.com` (Production).
2. Redeploy desde el dashboard (o cualquier push a `main`: el pipeline
   hace `vercel pull` + build + deploy con la nueva variable).
3. Si el dominio Vercel real difiere de
   `https://theoriginproject.vercel.app`, actualizar `CORS_ORIGINS` en
   [render.yaml](../render.yaml) y re-desplegar el backend.

### Notas del plan gratuito

- Cold starts: la primera petición tras inactividad tarda ~1 min.
- Disco efímero: `STORAGE_BACKEND=local` pierde archivos en cada
  despliegue; investigaciones/candidatos viven en Postgres y sí persisten.
- El build científico (astropy, scipy, photutils…) tarda varios minutos;
  si falla por memoria, reintentar o subir de plan.
- Observabilidad: logs a stdout (`LOG_LEVEL`), `X-Request-ID` en cada
  respuesta, `/api/v1/health` para probes (503 si la base cae), una línea JSON por petición
  con `request_id` y `duration_ms`, duración por etapa de cada job. OpenAPI en
  `/docs` solo fuera de producción.
- Seguridad: `CORS_ORIGINS` restringido al dominio del frontend; límites
  de descarga y rate-limit activos por defecto; sin credenciales en el repo.

### Alternativa: backend en Railway (Docker)

1. Railway Dashboard > New Project > Deploy from Repo >
   `luchitogeek22/theoriginproject`; en el servicio, Settings > Root
   Directory = `backend` (usa [Dockerfile](../backend/Dockerfile) +
   [railway.toml](../backend/railway.toml)).
2. Añadir plugin PostgreSQL al proyecto y referenciar su `DATABASE_URL`
   en el servicio backend (Variables > New Variable > Add Reference).
   Railway inyecta además `PORT` dinámico; el contenedor arranca con
   `uvicorn app.main:app --port ${PORT:-8000}`.
3. Variables del servicio backend:
   - `CORS_ORIGINS=https://vercel.app` (ver nota abajo).
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` (opcionales;
     sin ellas la API funciona en modo anónimo).
4. Deploy y verificar: `https://<servicio>.up.railway.app/api/v1/health`
   responde `{"status":"ok","version":"1.0.0","environment":"production","database":"ok"}`.
5. Apuntar el frontend: `NEXT_PUBLIC_API_URL` (Vercel) = URL de Railway.

Nota CORS: la imagen trae `CORS_ORIGINS=https://vercel.app` por defecto,
tal como se pidió. El dominio pelado `vercel.app` NO cubre subdominios:
si el frontend vive en `theoriginproject.vercel.app`, la variable en
Railway debe ser esa URL exacta (o ambas separadas por coma).

## Integración continua

[ci.yml](../.github/workflows/ci.yml) corre en cada pull request hacia
`developer` y `main` (y en cada push a `main`): `ruff check` y la suite de
`pytest` del backend (dependencias de `backend/requirements-dev.txt`), y
`npx tsc --noEmit` más `npm run build` del frontend. Un error de lint falla el
trabajo.

## Calentamiento de la caché antes de una demo

Tras desplegar, y con la ruta hacia IRSA disponible, prepara las secuencias de los cinco objetivos para que
la primera visita sea inmediata y para que sigan funcionando si IRSA cae:

```bash
cd backend
python scripts/warm_targets.py --api https://<api> --frontend https://<web>
python scripts/validate_motion.py --api https://<api> --out ../docs/validacion-movimiento.md
```

El primer comando tarda de 1 a 5 minutos por objetivo la primera vez (las descargas de IRSA van a ritmo
limitado) y es casi instantáneo después. Sale con código distinto de cero si algún objetivo tiene menos de
dos visitas. Con `--check` solo comprueba, sin reintentos.
