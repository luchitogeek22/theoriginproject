# THE ORIGIN PROJECT — scientific backend (FastAPI) — Railway-ready.
# Build context: backend/ (set the Railway service Root Directory to `backend`).
# Entry point verified: app.main:app (backend/app/main.py defines `app` once).
FROM python:3.12-slim

# Predictable, log-friendly runtime: no .pyc, unbuffered stdout, quiet pip.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# curl only exists for the container HEALTHCHECK below.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first so this layer is cached across code-only rebuilds.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code.
COPY app ./app

# Non-root runtime user + writable data dir (SQLite fallback / local storage).
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/data/storage \
    && chown -R appuser:appuser /app
USER appuser

# Production defaults. Railway service variables override these at runtime:
# set DATABASE_URL (auto-provided by the PostgreSQL plugin) and CORS_ORIGINS
# in the Railway dashboard; do NOT bake secrets into this image.
ENV ENVIRONMENT=production \
    LOG_LEVEL=INFO \
    API_HOST=0.0.0.0 \
    CORS_ORIGINS=https://vercel.app \
    LOCAL_STORAGE_DIR=/app/data/storage

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/api/v1/health" || exit 1

# Shell form is intentional: it expands Railway's dynamic $PORT at runtime
# (defaults to 8000 for local `docker run` without -e PORT).
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
