"""Health + live data-source status (probed on each call, never hardcoded)."""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.logging import get_logger
from app.schemas import DataSourcesResponse, DataSourceStatus, HealthResponse
from app.services.sia2_gateway import SPHERExDataGateway

log = get_logger("system")
router = APIRouter()


@router.get("/health", response_model=HealthResponse, responses={503: {"model": HealthResponse}})
def health(db: Session = Depends(get_db)):
    environment = get_settings().environment
    try:
        db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 - any failure means the database is unusable
        log.exception("health check: database unreachable")
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "unreachable", "environment": environment},
        )
    return HealthResponse(environment=environment)


@router.get("/data-sources/status", response_model=DataSourcesResponse)
def data_sources_status() -> DataSourcesResponse:
    gateway = SPHERExDataGateway()
    irsa = gateway.ping()
    sources = [
        DataSourceStatus(
            name=irsa["name"],
            reachable=bool(irsa["reachable"]),
            latency_ms=irsa["latency_ms"],
            detail=str(irsa["detail"]),
            checked_at=str(irsa["checked_at"]),
        )
    ]
    return DataSourcesResponse(sources=sources, collections=gateway.collection_info())
