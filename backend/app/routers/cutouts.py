"""Cutouts: IRSA spatial cutout download (idempotent per product, position, size, version)."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cutout
from app.schemas import CutoutRequest, CutoutResponse
from app.services import cutout_store
from app.services.cutout_store import cutout_url as _cutout_url  # noqa: F401 - kept for callers
from app.services.fits_processing import FITSProcessingService
from app.services.sia2_gateway import ArchiveUnavailableError, DownloadTooLargeError
from app.services.store import storage_exists, storage_get

router = APIRouter()
gateway = cutout_store.gateway
fits_service = FITSProcessingService()

PREVIEW_CACHE_CONTROL = "public, max-age=31536000, immutable"


def _response(result: cutout_store.CutoutResult) -> CutoutResponse:
    record = result.record
    return CutoutResponse(
        cutout_id=record.id,
        observation_id=record.observation_id,
        storage_key=record.storage_key,
        preview_url=f"/api/v1/cutouts/{record.id}/preview.png" if record.preview_key else "",
        sha256=record.sha256,
        size_bytes=record.size_bytes,
        source_url=record.source_url,
        fits_summary=result.summary,
        warning=result.warning,
    )


@router.post("/cutouts", response_model=CutoutResponse)
def create_cutout(payload: CutoutRequest, db: Session = Depends(get_db)) -> CutoutResponse:
    try:
        result = cutout_store.get_or_create_cutout(
            db, payload.observation_id, payload.ra_deg, payload.dec_deg, payload.size_arcmin
        )
    except cutout_store.ObservationNotFound as exc:
        raise HTTPException(status_code=404, detail="Observation not found") from exc
    except cutout_store.ObservationHasNoUrl as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DownloadTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except (ArchiveUnavailableError, ValueError) as exc:
        status = 422 if isinstance(exc, cutout_store.NotAFitsFile) else 502
        detail = f"access_url is not a FITS file: {exc}" if status == 422 else str(exc)
        raise HTTPException(status_code=status, detail=detail) from exc
    return _response(result)


@router.get("/cutouts/{cutout_id}/preview.png")
def preview_png(cutout_id: int, db: Session = Depends(get_db)) -> Response:
    record = db.get(Cutout, cutout_id)
    if record is None or not record.preview_key or not storage_exists(record.preview_key):
        raise HTTPException(status_code=404, detail="Preview not available")
    return Response(
        content=storage_get(record.preview_key),
        media_type="image/png",
        headers={"Cache-Control": PREVIEW_CACHE_CONTROL},
    )


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
