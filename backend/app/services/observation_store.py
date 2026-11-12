"""Observation persistence shared by the search endpoint and sequence jobs."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Observation


def upsert_observation(db: Session, row: dict, qhash: str) -> int | None:
    try:
        existing = db.scalar(
            select(Observation).where(
                Observation.product_id == row.get("product_id", ""),
                Observation.collection == row.get("collection", ""),
            )
        )
        if existing is not None:
            existing.query_hash = qhash
            return existing.id
        record = Observation(
            obs_id=row.get("obs_id", ""),
            product_id=row.get("product_id", ""),
            collection=row.get("collection", ""),
            ra_deg=row.get("ra_deg"),
            dec_deg=row.get("dec_deg"),
            fov_deg=row.get("fov_deg"),
            t_min_mjd=row.get("t_min_mjd"),
            t_max_mjd=row.get("t_max_mjd"),
            date_obs=row.get("date_obs", "") or "",
            instrument=row.get("instrument", "") or "",
            detector=str(row["detector"]) if row.get("detector") else "",
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
