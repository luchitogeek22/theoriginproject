"""Analysis (temporal / differential / spectral) + job polling + candidates."""

import base64
import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import UserInfo, get_optional_user
from app.database import SessionLocal, get_db
from app.models import Candidate, Cutout, Observation
from app.schemas import (
    CandidateItem,
    DifferentialAnalysisRequest,
    JobResponse,
    JobResultResponse,
    JobStatusResponse,
    SpectralAnalysisRequest,
    TemporalAnalysisRequest,
)
from app.services import jobs as job_store
from app.services.spectral import SpectralAnalysisEngine
from app.services.store import storage_get
from app.services.temporal import TemporalAnalysisEngine

router = APIRouter()
temporal = TemporalAnalysisEngine()
spectral = SpectralAnalysisEngine()


def _cutout_bundle(db: Session, cutout_id: int) -> tuple[bytes, dict]:
    record = db.get(Cutout, cutout_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Cutout {cutout_id} not found")
    obs = db.get(Observation, record.observation_id)
    meta = {}
    if obs is not None:
        meta = {
            "obs_id": obs.obs_id,
            "collection": obs.collection,
            "detector": obs.detector,
            "band": obs.band,
            "date_obs": obs.date_obs,
            "t_min_mjd": obs.t_min_mjd,
            "t_max_mjd": obs.t_max_mjd,
            "observation_id": obs.id,
        }
    return storage_get(record.storage_key), meta


def _store_images_and_candidates(job_id: str, kind: str, result: dict,
                                 obs_a_id: int | None, obs_b_id: int | None,
                                 user_id: str | None = None) -> None:
    from app.services.store import storage_put

    images = result.pop("images", {})
    for name, b64 in images.items():
        key = f"jobs/{job_id}_{name}.png"
        storage_put(key, base64.b64decode(b64))
        result.setdefault("artifacts", {})[name] = f"/api/v1/jobs/{job_id}/artifact/{name}.png"
    detections = result.get("detections", []) if isinstance(result, dict) else []
    astrometry = result.get("astrometry", {}) if isinstance(result, dict) else {}
    db = SessionLocal()
    try:
        for det in detections[:10]:
            db.add(Candidate(
                kind="unclassified",
                ra_deg=float(astrometry.get("ra_a_deg", 0.0) or 0.0),
                dec_deg=float(astrometry.get("dec_a_deg", 0.0) or 0.0),
                job_id=job_id,
                obs_a_id=obs_a_id,
                obs_b_id=obs_b_id,
                snr=float(det.get("peak_snr")) if det.get("peak_snr") is not None else None,
                quality="possible candidate",
                evidence_json=json.dumps({"detection": det, "astrometry": astrometry}),
                user_id=user_id,
            ))
        if astrometry.get("measured"):
            db.add(Candidate(
                kind="possible moving source",
                ra_deg=float(astrometry["ra_a_deg"]),
                dec_deg=float(astrometry["dec_a_deg"]),
                job_id=job_id,
                obs_a_id=obs_a_id,
                obs_b_id=obs_b_id,
                separation_arcsec=astrometry.get("separation_arcsec"),
                separation_err_arcsec=astrometry.get("separation_err_arcsec"),
                quality="possible candidate",
                evidence_json=json.dumps({"astrometry": astrometry}),
                user_id=user_id,
            ))
        db.commit()
    finally:
        db.close()


def _run_temporal(params: dict) -> dict:
    db = SessionLocal()
    try:
        data_a, meta_a = _cutout_bundle(db, params["cutout_a_id"])
        data_b, meta_b = _cutout_bundle(db, params["cutout_b_id"])
    finally:
        db.close()
    result = temporal.compare(
        data_a, data_b, meta_a, meta_b,
        ra_deg=params.get("ra_deg"), dec_deg=params.get("dec_deg"),
        detection_sigma=params.get("detection_sigma", 5.0),
    )
    _store_images_and_candidates(params["_job_id"], "temporal", result,
                                 meta_a.get("observation_id"), meta_b.get("observation_id"),
                                 params.get("user_id"))
    return result


def _run_spectral(params: dict) -> dict:
    db = SessionLocal()
    try:
        data, meta = _cutout_bundle(db, params["cutout_id"])
    finally:
        db.close()
    return spectral.extract(data, meta, params["ra_deg"], params["dec_deg"])


@router.post("/analysis/temporal", response_model=JobResponse)
def analyze_temporal(payload: TemporalAnalysisRequest, tasks: BackgroundTasks,
                     user: UserInfo | None = Depends(get_optional_user)) -> JobResponse:
    params = payload.model_dump()
    params["user_id"] = user.user_id if user else None
    job_id = job_store.create_job("temporal", params)
    params["_job_id"] = job_id
    tasks.add_task(job_store.run_job, job_id, "temporal", params, lambda: _run_temporal(params))
    return JobResponse(job_id=job_id, kind="temporal", status="queued")


@router.post("/analysis/differential", response_model=JobResponse)
def analyze_differential(payload: DifferentialAnalysisRequest, tasks: BackgroundTasks,
                         user: UserInfo | None = Depends(get_optional_user)) -> JobResponse:
    params = payload.model_dump()
    params["user_id"] = user.user_id if user else None
    job_id = job_store.create_job("differential", params)
    params["_job_id"] = job_id
    tasks.add_task(job_store.run_job, job_id, "differential", params, lambda: _run_temporal(params))
    return JobResponse(job_id=job_id, kind="differential", status="queued")


@router.post("/analysis/spectral", response_model=JobResponse)
def analyze_spectral(payload: SpectralAnalysisRequest, tasks: BackgroundTasks,
                     user: UserInfo | None = Depends(get_optional_user)) -> JobResponse:
    params = payload.model_dump()
    params["user_id"] = user.user_id if user else None
    job_id = job_store.create_job("spectral", params)
    tasks.add_task(job_store.run_job, job_id, "spectral", params, lambda: _run_spectral(params))
    return JobResponse(job_id=job_id, kind="spectral", status="queued")


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def job_status(job_id: str) -> JobStatusResponse:
    job = job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(**{k: job[k] for k in
                                ("job_id", "kind", "status", "error", "created_at", "updated_at")})


@router.get("/jobs/{job_id}/results", response_model=JobResultResponse)
def job_results(job_id: str) -> JobResultResponse:
    job = job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResultResponse(job_id=job["job_id"], kind=job["kind"], status=job["status"],
                             result=job["result"], error=job["error"])


@router.get("/jobs/{job_id}/artifact/{name}.png")
def job_artifact(job_id: str, name: str):
    from fastapi import Response

    from app.services.store import storage_exists

    if name not in ("a_png", "b_png", "diff_png"):
        raise HTTPException(status_code=404, detail="Unknown artifact")
    key = f"jobs/{job_id}_{name}.png"
    if not storage_exists(key):
        raise HTTPException(status_code=404, detail="Artifact not ready")
    return Response(content=storage_get(key), media_type="image/png")


@router.get("/candidates", response_model=list[CandidateItem])
def list_candidates(limit: int = 100, db: Session = Depends(get_db)) -> list[CandidateItem]:
    rows = db.scalars(select(Candidate).order_by(Candidate.id.desc()).limit(limit)).all()
    out = []
    for row in rows:
        try:
            evidence = json.loads(row.evidence_json or "{}")
        except ValueError:
            evidence = {}
        out.append(CandidateItem(
            id=row.id, kind=row.kind, ra_deg=row.ra_deg, dec_deg=row.dec_deg,
            job_id=row.job_id, separation_arcsec=row.separation_arcsec,
            separation_err_arcsec=row.separation_err_arcsec, delta_mag=row.delta_mag,
            snr=row.snr, quality=row.quality, evidence=evidence, user_id=row.user_id,
        ))
    return out
