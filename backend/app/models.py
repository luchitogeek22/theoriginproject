"""Persistence models. Every computed row keeps a link to its source observations."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Target(Base):
    __tablename__ = "targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256), index=True)
    catalog_id: Mapped[str] = mapped_column(String(256), default="")
    ra_deg: Mapped[float] = mapped_column(Float)
    dec_deg: Mapped[float] = mapped_column(Float)
    frame: Mapped[str] = mapped_column(String(32), default="ICRS")
    epoch: Mapped[str] = mapped_column(String(32), default="J2000")
    resolver: Mapped[str] = mapped_column(String(64), default="")
    resolved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    warning: Mapped[str] = mapped_column(Text, default="")


class Observation(Base):
    __tablename__ = "observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    obs_id: Mapped[str] = mapped_column(String(512), index=True)
    product_id: Mapped[str] = mapped_column(String(512), index=True, default="")
    collection: Mapped[str] = mapped_column(String(128), index=True)
    ra_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    dec_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    fov_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    t_min_mjd: Mapped[float | None] = mapped_column(Float, nullable=True)
    t_max_mjd: Mapped[float | None] = mapped_column(Float, nullable=True)
    date_obs: Mapped[str] = mapped_column(String(64), default="")
    instrument: Mapped[str] = mapped_column(String(128), default="")
    detector: Mapped[str] = mapped_column(String(128), default="")
    band: Mapped[str] = mapped_column(String(128), default="")
    dataproduct_type: Mapped[str] = mapped_column(String(128), default="")
    access_url: Mapped[str] = mapped_column(Text, default="")
    access_format: Mapped[str] = mapped_column(String(128), default="")
    filesize_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    s_region: Mapped[str] = mapped_column(Text, default="")
    queried_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    query_hash: Mapped[str] = mapped_column(String(64), index=True, default="")


class Cutout(Base):
    __tablename__ = "cutouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    observation_id: Mapped[int] = mapped_column(Integer, index=True)
    ra_deg: Mapped[float] = mapped_column(Float)
    dec_deg: Mapped[float] = mapped_column(Float)
    size_arcmin: Mapped[float] = mapped_column(Float)
    storage_key: Mapped[str] = mapped_column(String(1024), default="")
    preview_key: Mapped[str] = mapped_column(String(1024), default="")
    sha256: Mapped[str] = mapped_column(String(64), default="")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    source_url: Mapped[str] = mapped_column(Text, default="")
    cache_key: Mapped[str] = mapped_column(String(64), index=True, default="")
    processing_version: Mapped[str] = mapped_column(String(32), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued")
    params_json: Mapped[str] = mapped_column(Text, default="{}")
    result_json: Mapped[str] = mapped_column(Text, default="{}")
    error: Mapped[str] = mapped_column(Text, default="")
    stage: Mapped[str] = mapped_column(String(64), default="")
    done: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, default=0)
    input_hash: Mapped[str] = mapped_column(String(64), index=True, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(64), index=True)
    ra_deg: Mapped[float] = mapped_column(Float)
    dec_deg: Mapped[float] = mapped_column(Float)
    job_id: Mapped[str] = mapped_column(String(64), index=True)
    obs_a_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    obs_b_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    separation_arcsec: Mapped[float | None] = mapped_column(Float, nullable=True)
    separation_err_arcsec: Mapped[float | None] = mapped_column(Float, nullable=True)
    delta_mag: Mapped[float | None] = mapped_column(Float, nullable=True)
    snr: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality: Mapped[str] = mapped_column(String(32), default="unclassified")
    evidence_json: Mapped[str] = mapped_column(Text, default="{}")
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class ResearchSession(Base):
    __tablename__ = "research_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(256), default="")
    target_name: Mapped[str] = mapped_column(String(256), default="")
    ra_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    dec_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    verification_hash: Mapped[str] = mapped_column(String(64), default="")
    hash_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
