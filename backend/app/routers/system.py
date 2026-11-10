"""Health + live data-source status (probed on each call, never hardcoded)."""

from fastapi import APIRouter

from app.config import get_settings
from app.schemas import DataSourcesResponse, DataSourceStatus, HealthResponse
from app.services.sia2_gateway import SPHERExDataGateway

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(environment=get_settings().environment)


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
    return DataSourcesResponse(sources=sources)
