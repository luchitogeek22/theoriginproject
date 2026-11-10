"""Observation search (live SIA2) + cached record retrieval."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db, init_db
from app.models import Observation
from app.schemas import ObservationItem, ObservationSearchRequest, ObservationSearchResponse
from app.services.sia2_gateway import ArchiveUnavailableError, SPHERExDataGateway, query_hash

router = APIRouter()
gateway = SPHERExDataGateway()


@router.post("/observations/search", response_model=ObservationSearchResponse)
def search(payload: ObservationSearchRequest, db: Session = Depends(get_db)) -> ObservationSearchResponse:
    init_db()
    try:
        result = gateway.search(
            payload.ra_deg,
            payload.dec_deg,
            payload.radius_arcmin,
            payload.collections,
            payload.t_min_mjd,
            payload.t_max_mjd,
            payload.maxrec,
        )
    except ArchiveUnavailableError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    qhash = query_hash(payload.ra_deg, payload.dec_deg, payload.radius_arcmin,
                       payload.collections or gateway.settings.collection_list)
    items: list[ObservationItem] = []
    for row in result["items"]:
        record_id = _upsert(db, row, qhash)
        items.append(ObservationItem(id=record_id, **row))
    db.commit()
    return ObservationSearchResponse(
        count=len(items),
        items=items,
        queried_at=result["queried_at"],
        cached=result["cached"],
        collections_queried=result["collections_queried"],
        warnings=result["warnings"],
    )


def _upsert(db: Session, row: dict, qhash: str) -> int | None:
    try:
        existing = db.scalar(
            select(Observation).where(
                Observation.obs_id == row.get("obs_id", ""),
                Observation.collection == row.get("collection", ""),
            )
        )
        if existing is not None:
            existing.query_hash = qhash
            return existing.id
        record = Observation(
            obs_id=row.get("obs_id", ""),
            collection=row.get("collection", ""),
            ra_deg=row.get("ra_deg"),
            dec_deg=row.get("dec_deg"),
            fov_deg=row.get("fov_deg"),
            t_min_mjd=row.get("t_min_mjd"),
            t_max_mjd=row.get("t_max_mjd"),
            date_obs=row.get("date_obs", "") or "",
            instrument=row.get("instrument", "") or "",
            detector=row.get("detector", "") or "",
            band=row.get("band", "") or "",
            dataproduct_type=row.get("dataproduct_type", "") or "",
            access_url=row.get("access_url", "") or "",
            access_format=row.get("access_format", "") or "",
            filesize_bytes=row.get("filesize_bytes"),
            s_region=row.get("s_region", "") or "",
            query_hash=qhash,
        )
        db.add(record)
        db.flush()
        return record.id
    except Exception:  # noqa: BLE001
        db.rollback()
        return None


@router.get("/observations/{record_id}", response_model=ObservationItem)
def get_observation(record_id: int, db: Session = Depends(get_db)) -> ObservationItem:
    record = db.get(Observation, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    return ObservationItem(
        id=record.id,
        obs_id=record.obs_id,
        collection=record.collection,
        ra_deg=record.ra_deg,
        dec_deg=record.dec_deg,
        fov_deg=record.fov_deg,
        t_min_mjd=record.t_min_mjd,
        t_max_mjd=record.t_max_mjd,
        date_obs=record.date_obs,
        instrument=record.instrument,
        detector=record.detector,
        band=record.band,
        dataproduct_type=record.dataproduct_type,
        access_url=record.access_url,
        access_format=record.access_format,
        filesize_bytes=record.filesize_bytes,
        s_region=record.s_region,
    )
