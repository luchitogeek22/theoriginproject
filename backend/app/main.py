"""FastAPI application: versioned API, request IDs, rate limiting, error handling."""

import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import init_db
from app.logging import configure_logging, get_logger
from app.routers import analysis, cutouts, observations, research, sky, system, targets

settings = get_settings()
configure_logging(settings.log_level)
log = get_logger("main")

_hits: dict[str, list[float]] = defaultdict(list)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    log.info("origin backend ready (env=%s)", settings.environment)
    yield


app = FastAPI(
    title="THE ORIGIN PROJECT — Scientific API",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:12])
    client = request.client.host if request.client else "unknown"
    now = time.monotonic()
    window = _hits[client]
    window[:] = [t for t in window if now - t < 60]
    if len(window) >= settings.rate_limit_per_minute:
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Retry in a few seconds."},
            headers={"X-Request-ID": request_id},
        )
    window.append(now)
    started = time.monotonic()
    try:
        response = await call_next(request)
    except Exception as exc:  # noqa: BLE001 - last-resort guard
        log.exception("unhandled error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal error. The request was logged."},
            headers={"X-Request-ID": request_id},
        )
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Elapsed-ms"] = str(int((time.monotonic() - started) * 1000))
    log.info("%s %s -> %s", request.method, request.url.path, response.status_code)
    return response


app.include_router(system.router, prefix="/api/v1", tags=["system"])
app.include_router(targets.router, prefix="/api/v1", tags=["targets"])
app.include_router(observations.router, prefix="/api/v1", tags=["observations"])
app.include_router(cutouts.router, prefix="/api/v1", tags=["cutouts"])
app.include_router(analysis.router, prefix="/api/v1", tags=["analysis"])
app.include_router(research.router, prefix="/api/v1", tags=["research"])
app.include_router(sky.router, prefix="/api/v1", tags=["sky"])
