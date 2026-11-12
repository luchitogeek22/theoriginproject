"""FastAPI application: versioned API, request IDs, rate limiting, error handling."""

import re
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware

from app.config import Settings, get_settings
from app.database import init_db
from app.logging import configure_logging, get_logger, request_id_var
from app.routers import (
    analysis, cutouts, observations, research, sequences, sky, spectra, system, targets,
)
from app.services.jobs import reconcile_interrupted

settings = get_settings()
configure_logging(settings.log_level)
log = get_logger("main")

RATE_WINDOW_SECONDS = 60
RATE_EXEMPT_PATHS = {"/api/v1/health"}
SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
BODY_TOO_LARGE = "Request body too large (limit 1 MB)."

_hits: dict[str, list[float]] = defaultdict(list)
_state = {"last_sweep": 0.0}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    interrupted = reconcile_interrupted()
    if interrupted:
        log.warning("marked %d interrupted job(s) as failed", interrupted)
    if settings.discover_collections:
        from app.routers.sequences import gateway as archive_gateway

        archive_gateway.collection_info()
    log.info("origin backend ready (env=%s)", settings.environment)
    yield


def _client_key(request: Request) -> str:
    hops = settings.trusted_proxy_hops
    forwarded = request.headers.get("x-forwarded-for", "")
    if hops > 0 and forwarded:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if parts:
            return parts[-hops] if len(parts) >= hops else parts[0]
    return request.client.host if request.client else "unknown"


def _sweep(now: float) -> None:
    if now - _state["last_sweep"] < RATE_WINDOW_SECONDS:
        return
    _state["last_sweep"] = now
    for key in [k for k, w in _hits.items() if not w or now - w[-1] >= RATE_WINDOW_SECONDS]:
        del _hits[key]


def _over_limit(request: Request) -> bool:
    if request.method == "OPTIONS" or request.url.path in RATE_EXEMPT_PATHS:
        return False
    now = time.monotonic()
    _sweep(now)
    window = _hits[_client_key(request)]
    window[:] = [t for t in window if now - t < RATE_WINDOW_SECONDS]
    if len(window) >= settings.rate_limit_per_minute:
        return True
    window.append(now)
    return False


async def request_context(request: Request, call_next):
    supplied = request.headers.get("X-Request-ID", "")
    request_id = supplied if SAFE_REQUEST_ID.match(supplied) else uuid.uuid4().hex[:12]
    token = request_id_var.set(request_id)
    started = time.monotonic()
    try:
        if _over_limit(request):
            response = JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Retry in a few seconds."},
            )
        else:
            try:
                response = await call_next(request)
            except Exception as exc:  # noqa: BLE001 - last-resort guard
                log.exception("unhandled error: %s", exc)
                response = JSONResponse(
                    status_code=500,
                    content={"detail": "Internal error. The request was logged."},
                )
        duration_ms = int((time.monotonic() - started) * 1000)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Elapsed-ms"] = str(duration_ms)
        log.info(
            "%s %s -> %s", request.method, request.url.path, response.status_code,
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response
    finally:
        request_id_var.reset(token)


class BodyLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = settings.max_body_bytes
        declared = dict(scope["headers"]).get(b"content-length", b"")
        if declared.isdigit() and int(declared) > limit:
            await JSONResponse(status_code=413, content={"detail": BODY_TOO_LARGE})(
                scope, receive, send
            )
            return
        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise HTTPException(status_code=413, detail=BODY_TOO_LARGE)
            return message

        await self.app(scope, limited_receive, send)


def create_app(app_settings: Settings | None = None) -> FastAPI:
    config = app_settings or settings
    docs_enabled = config.environment != "production"
    application = FastAPI(
        title="THE ORIGIN PROJECT — Scientific API",
        version="1.0.0",
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
        lifespan=lifespan,
    )
    application.add_middleware(BodyLimitMiddleware)
    application.add_middleware(BaseHTTPMiddleware, dispatch=request_context)
    application.add_middleware(GZipMiddleware, minimum_size=1024)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for module, tag in (
        (system, "system"), (targets, "targets"), (observations, "observations"),
        (cutouts, "cutouts"), (analysis, "analysis"), (sequences, "sequences"),
        (research, "research"), (sky, "sky"), (spectra, "spectra"),
    ):
        application.include_router(module.router, prefix="/api/v1", tags=[tag])
    return application


app = create_app()
