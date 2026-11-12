"""Observation search (live SIA2) + cached record retrieval."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Observation
from app.services.observation_store import upsert_observation
from app.schemas import ObservationItem, ObservationSearchRequest, ObservationSearchResponse
from app.services.sia2_gateway import (
    ArchiveUnavailableError,
    InvalidCollectionError,
    SPHERExDataGateway,
    query_hash,
)

router = APIRouter()
gateway = SPHERExDataGateway()


@router.post("/observations/search", response_model=ObservationSearchResponse)
def search(payload: ObservationSearchRequest, db: Session = Depends(get_db)) -> ObservationSearchResponse:
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
    except InvalidCollectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ArchiveUnavailableError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    qhash = query_hash(
        payload.ra_deg, payload.dec_deg, payload.radius_arcmin,
        payload.collections or gateway.available_collections(),
        payload.t_min_mjd, payload.t_max_mjd, payload.maxrec,
        gateway.settings.irsa_sia2_url,
    )
    items: list[ObservationItem] = []
    for row in result["items"]:
        record_id = upsert_observation(db, row, qhash)
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


@router.get("/observations/{record_id}", response_model=ObservationItem)
def get_observation(record_id: int, db: Session = Depends(get_db)) -> ObservationItem:
    record = db.get(Observation, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    return ObservationItem(
        id=record.id,
        obs_id=record.obs_id,
        product_id=record.product_id,
        collection=record.collection,
        ra_deg=record.ra_deg,
        dec_deg=record.dec_deg,
        fov_deg=record.fov_deg,
        t_min_mjd=record.t_min_mjd,
        t_max_mjd=record.t_max_mjd,
        date_obs=record.date_obs,
        instrument=record.instrument,
        detector=int(record.detector) if record.detector.isdigit() else None,
        band=record.band,
        dataproduct_type=record.dataproduct_type,
        access_url=record.access_url,
        access_format=record.access_format,
        filesize_bytes=record.filesize_bytes,
        s_region=record.s_region,
    )
