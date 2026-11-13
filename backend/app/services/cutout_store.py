"""Idempotent cutout acquisition shared by the cutout endpoint and sequence jobs."""

import hashlib
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Cutout, Observation
from app.services.fits_processing import FITSProcessingService, sha256_bytes
from app.services.sia2_gateway import SPHERExDataGateway
from app.services.store import storage_exists, storage_get, storage_put

gateway = SPHERExDataGateway()
fits_service = FITSProcessingService()


class ObservationNotFound(LookupError):
    pass


class ObservationHasNoUrl(ValueError):
    pass


class NotAFitsFile(ValueError):
    pass


@dataclass
class CutoutResult:
    record: Cutout
    summary: dict
    warning: str
    data: bytes


def cutout_url(access_url: str, ra: float, dec: float, size_arcmin: float) -> str:
    """IRSA cutout service syntax: center in degrees, size in degrees."""
    sep = "&" if "?" in access_url else "?"
    return f"{access_url}{sep}center={ra:.6f},{dec:.6f}&size={size_arcmin / 60.0:.6f}"


def cache_key(observation_id: int, ra: float, dec: float, size_arcmin: float, version: str) -> str:
    raw = f"{observation_id}|{ra:.6f}|{dec:.6f}|{size_arcmin:.4f}|{version}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def get_or_create_cutout(
    db: Session, observation_id: int, ra: float, dec: float, size_arcmin: float
) -> CutoutResult:
    """Return the stored cutout or download it. Releases the DB connection while downloading."""
    version = get_settings().processing_version
    key = cache_key(observation_id, ra, dec, size_arcmin, version)
    obs = db.get(Observation, observation_id)
    if obs is None:
        raise ObservationNotFound(observation_id)
    if not obs.access_url:
        raise ObservationHasNoUrl("Observation has no access_url.")
    access_url, label = obs.access_url, obs.obs_id
    existing = db.scalar(select(Cutout).where(Cutout.cache_key == key).order_by(Cutout.id).limit(1))
    existing_id = existing.id if existing is not None else None
    if existing is not None and storage_exists(existing.storage_key):
        stored = storage_get(existing.storage_key)
        db.rollback()
        return CutoutResult(existing, fits_service.summarize(stored), "", stored)
    db.rollback()

    data, final_url = gateway.download(cutout_url(access_url, ra, dec, size_arcmin), dest_hint=label)
    try:
        summary = fits_service.summarize(data)
    except ValueError as exc:
        raise NotAFitsFile(str(exc)) from exc
    digest = sha256_bytes(data)
    blob_key = f"cutouts/{digest[:16]}.fits"
    storage_put(blob_key, data)
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
    record = db.get(Cutout, existing_id) if existing_id is not None else None
    if record is None:
        record = Cutout(
            observation_id=observation_id,
            ra_deg=ra,
            dec_deg=dec,
            size_arcmin=size_arcmin,
            cache_key=key,
            processing_version=version,
        )
        db.add(record)
    record.storage_key = blob_key
    record.preview_key = preview_key
    record.sha256 = digest
    record.size_bytes = len(data)
    record.source_url = final_url
    db.commit()
    db.refresh(record)
    return CutoutResult(record, summary, warning, data)
