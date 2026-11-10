"""Cutouts: spatial subset download (SIA2 POS cutout when supported) + FITS summary."""

import hashlib

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db, init_db
from app.models import Cutout, Observation
from app.schemas import CutoutRequest, CutoutResponse
from app.services.fits_processing import FITSProcessingService, sha256_bytes
from app.services.sia2_gateway import ArchiveUnavailableError, SPHERExDataGateway
from app.services.store import storage_exists, storage_get, storage_put

router = APIRouter()
gateway = SPHERExDataGateway()
fits_service = FITSProcessingService()


def _cutout_url(access_url: str, ra: float, dec: float, size_arcmin: float) -> str:
    """Request a spatial cutout through SIA2 POS semantics when the service honors it."""
    radius_deg = (size_arcmin / 60.0) / 2.0
    sep = "&" if "?" in access_url else "?"
    return (
        f"{access_url}{sep}POS=CIRCLE {ra:.6f} {dec:.6f} {radius_deg:.6f}"
        "&RESPONSEFORMAT=application/fits"
    )


@router.post("/cutouts", response_model=CutoutResponse)
def create_cutout(payload: CutoutRequest, db: Session = Depends(get_db)) -> CutoutResponse:
    init_db()
    obs = db.get(Observation, payload.observation_id)
    if obs is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    if not obs.access_url:
        raise HTTPException(status_code=422, detail="Observation has no access_url.")
    url = _cutout_url(obs.access_url, payload.ra_deg, payload.dec_deg, payload.size_arcmin)
    try:
        data, final_url = gateway.download(url, dest_hint=obs.obs_id)
    except (ArchiveUnavailableError, ValueError) as exc:
        # Fall back to the full file URL only if the cutout form fails.
        try:
            data, final_url = gateway.download(obs.access_url, dest_hint=obs.obs_id)
        except (ArchiveUnavailableError, ValueError) as exc2:
            raise HTTPException(status_code=502, detail=str(exc2)) from exc2
    try:
        summary = fits_service.summarize(data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"access_url is not a FITS file: {exc}") from exc
    digest = sha256_bytes(data)
    key = f"cutouts/{digest[:16]}.fits"
    storage_put(key, data)
    preview_key = f"cutouts/{digest[:16]}_preview.png"
    warning = ""
    try:
        storage_put(preview_key, fits_service.render_preview(data))
    except Exception as exc:  # noqa: BLE001 - preview must never fail the cutout
        preview_key = ""
        warning = (
            f"Preview unavailable ({exc}); "
            "the FITS data was stored and remains usable for analysis."
        )
    record = Cutout(
        observation_id=obs.id,
        ra_deg=payload.ra_deg,
        dec_deg=payload.dec_deg,
        size_arcmin=payload.size_arcmin,
        storage_key=key,
        preview_key=preview_key,
        sha256=digest,
        size_bytes=len(data),
        source_url=final_url,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return CutoutResponse(
        cutout_id=record.id,
        observation_id=obs.id,
        storage_key=key,
        preview_url=f"/api/v1/cutouts/{record.id}/preview.png" if preview_key else "",
        sha256=digest,
        size_bytes=len(data),
        source_url=final_url,
        fits_summary=summary,
        warning=warning,
    )


@router.get("/cutouts/{cutout_id}/preview.png")
def preview_png(cutout_id: int, db: Session = Depends(get_db)) -> Response:
    record = db.get(Cutout, cutout_id)
    if record is None or not record.preview_key or not storage_exists(record.preview_key):
        raise HTTPException(status_code=404, detail="Preview not available")
    return Response(content=storage_get(record.preview_key), media_type="image/png")


@router.get("/cutouts/{cutout_id}/download")
def download_fits(cutout_id: int, db: Session = Depends(get_db)) -> Response:
    record = db.get(Cutout, cutout_id)
    if record is None or not storage_exists(record.storage_key):
        raise HTTPException(status_code=404, detail="Cutout file not available")
    return Response(
        content=storage_get(record.storage_key),
        media_type="application/fits",
        headers={"Content-Disposition": f"attachment; filename=cutout_{cutout_id}.fits"},
    )
