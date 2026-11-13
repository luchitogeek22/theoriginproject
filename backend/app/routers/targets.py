"""Target resolution endpoints. GET is read-only; POST also records the resolution."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Target
from app.schemas import TargetResolveRequest, TargetResolveResponse
from app.services.targets import ResolutionError, TargetResolutionService

router = APIRouter()
service = TargetResolutionService()


def _persist(db: Session, result: dict) -> int | None:
    try:
        record = Target(
            name=result["name"],
            catalog_id=result.get("catalog_id", ""),
            ra_deg=result["ra_deg"],
            dec_deg=result["dec_deg"],
            frame=result.get("frame", "ICRS"),
            epoch=result.get("epoch", "J2000"),
            resolver=result.get("resolver", ""),
            warning=result.get("warning", ""),
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record.id
    except Exception:  # noqa: BLE001 - persistence must not break resolution
        db.rollback()
        return None


def _resolve(payload: TargetResolveRequest) -> dict:
    try:
        return service.resolve(
            name=payload.name,
            ra_deg=payload.ra_deg,
            dec_deg=payload.dec_deg,
            catalog_id=payload.catalog_id,
            query=payload.query,
            obstime=payload.obstime,
        )
    except ResolutionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/targets/resolve", response_model=TargetResolveResponse)
def resolve_get(
    query: str | None = Query(default=None, max_length=256),
    name: str | None = Query(default=None, max_length=256),
    ra_deg: float | None = Query(default=None, ge=0, lt=360),
    dec_deg: float | None = Query(default=None, ge=-90, le=90),
    catalog_id: str | None = Query(default=None, max_length=256),
    obstime: date | None = None,
) -> TargetResolveResponse:
    payload = TargetResolveRequest(
        query=query, name=name, ra_deg=ra_deg, dec_deg=dec_deg,
        catalog_id=catalog_id, obstime=obstime,
    )
    return TargetResolveResponse(**_resolve(payload))


@router.post("/targets/resolve", response_model=TargetResolveResponse)
def resolve_post(
    payload: TargetResolveRequest, db: Session = Depends(get_db)
) -> TargetResolveResponse:
    result = _resolve(payload)
    return TargetResolveResponse(record_id=_persist(db, result), **result)
