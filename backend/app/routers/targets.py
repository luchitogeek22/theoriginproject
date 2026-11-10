"""Target resolution endpoints (GET + POST)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db, init_db
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


def _resolve(payload: TargetResolveRequest, db: Session) -> TargetResolveResponse:
    init_db()
    try:
        result = service.resolve(payload.name, payload.ra_deg, payload.dec_deg,
                                 payload.catalog_id)
    except ResolutionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    record_id = _persist(db, result)
    return TargetResolveResponse(record_id=record_id, **result)


@router.get("/targets/resolve", response_model=TargetResolveResponse)
def resolve_get(
    name: str | None = None,
    ra_deg: float | None = None,
    dec_deg: float | None = None,
    catalog_id: str | None = None,
    db: Session = Depends(get_db),
) -> TargetResolveResponse:
    return _resolve(TargetResolveRequest(name=name, ra_deg=ra_deg, dec_deg=dec_deg,
                                         catalog_id=catalog_id), db)


@router.post("/targets/resolve", response_model=TargetResolveResponse)
def resolve_post(payload: TargetResolveRequest, db: Session = Depends(get_db)) -> TargetResolveResponse:
    return _resolve(payload, db)
