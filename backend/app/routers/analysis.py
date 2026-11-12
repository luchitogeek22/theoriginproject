"""Analysis (temporal / differential / spectral) + job polling + candidates."""

import base64
import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
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
    VetRequest,
)
from app.routers.job_submit import submit_job as _submit
from app.services import jobs as job_store
from app.services.spectral import SpectralAnalysisEngine
from app.services.store import storage_exists, storage_get
from app.services.temporal import TemporalAnalysisEngine

router = APIRouter()
temporal = TemporalAnalysisEngine()
spectral = SpectralAnalysisEngine()


def _cutout_bundle(db: Session, cutout_id: int) -> tuple[bytes, dict]:
    record = db.get(Cutout, cutout_id)
    if record is None:
        raise job_store.UserFacingError(f"Cutout {cutout_id} not found.")
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
                                 user_id: str | None = None,
                                 cutout_ids: tuple[int, int] | None = None) -> None:
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
        for det in [d for d in detections if d.get("ra_deg") is not None][:10]:
            db.add(Candidate(
                kind="unclassified",
                ra_deg=float(det["ra_deg"]),
                dec_deg=float(det["dec_deg"]),
                job_id=job_id,
                obs_a_id=obs_a_id,
                obs_b_id=obs_b_id,
                snr=float(det.get("peak_snr")) if det.get("peak_snr") is not None else None,
                quality="possible candidate",
                evidence_json=json.dumps({"detection": det, "astrometry": astrometry, "cutouts": cutout_ids}),
                user_id=user_id,
            ))
        if astrometry.get("measured") and astrometry.get("significant"):
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
                evidence_json=json.dumps({"astrometry": astrometry, "cutouts": cutout_ids}),
                user_id=user_id,
            ))
        db.commit()
    finally:
        db.close()


def _run_temporal(params: dict) -> dict:
    job_id = params["_job_id"]
    job_store.set_progress(job_id, "loading cutouts", 0, 3)
    db = SessionLocal()
    try:
        data_a, meta_a = _cutout_bundle(db, params["cutout_a_id"])
        data_b, meta_b = _cutout_bundle(db, params["cutout_b_id"])
    finally:
        db.close()
    job_store.set_progress(job_id, "comparing epochs", 1, 3)
    result = temporal.compare(
        data_a, data_b, meta_a, meta_b,
        ra_deg=params.get("ra_deg"), dec_deg=params.get("dec_deg"),
        detection_sigma=params.get("detection_sigma", 5.0),
    )
    job_store.set_progress(job_id, "storing results", 2, 3)
    _store_images_and_candidates(job_id, "temporal", result,
                                 meta_a.get("observation_id"), meta_b.get("observation_id"),
                                 params.get("user_id"),
                                 (params["cutout_a_id"], params["cutout_b_id"]))
    return result


def _run_spectral(params: dict) -> dict:
    job_store.set_progress(params["_job_id"], "extracting spectrum", 0, 1)
    db = SessionLocal()
    try:
        data, meta = _cutout_bundle(db, params["cutout_id"])
    finally:
        db.close()
    return spectral.extract(data, meta, params["ra_deg"], params["dec_deg"])


def _compatible_cutouts(db: Session, cutout_a_id: int, cutout_b_id: int) -> Cutout:
    records = []
    for cutout_id in (cutout_a_id, cutout_b_id):
        record = db.get(Cutout, cutout_id)
        if record is None:
            raise HTTPException(status_code=404, detail=f"Cutout {cutout_id} not found")
        records.append(record)
    detectors = []
    for record in records:
        obs = db.get(Observation, record.observation_id)
        detectors.append(obs.detector if obs is not None else "")
    if not all(d for d in detectors) or detectors[0] != detectors[1]:
        raise HTTPException(
            status_code=422,
            detail="Both cutouts must come from the same known detector; "
            "SPHEREx detectors cannot be compared.",
        )
    return records[0]


@router.post("/analysis/temporal", response_model=JobResponse)
def analyze_temporal(payload: TemporalAnalysisRequest, tasks: BackgroundTasks,
                     user: UserInfo | None = Depends(get_optional_user),
                     db: Session = Depends(get_db)) -> JobResponse:
    _compatible_cutouts(db, payload.cutout_a_id, payload.cutout_b_id)
    return _submit("temporal", payload.model_dump(), tasks, user, _run_temporal)


@router.post("/analysis/differential", response_model=JobResponse)
def analyze_differential(payload: DifferentialAnalysisRequest, tasks: BackgroundTasks,
                         user: UserInfo | None = Depends(get_optional_user),
                         db: Session = Depends(get_db)) -> JobResponse:
    first = _compatible_cutouts(db, payload.cutout_a_id, payload.cutout_b_id)
    params = payload.model_dump()
    params["ra_deg"], params["dec_deg"] = first.ra_deg, first.dec_deg
    return _submit("differential", params, tasks, user, _run_temporal)


@router.post("/analysis/spectral", response_model=JobResponse)
def analyze_spectral(payload: SpectralAnalysisRequest, tasks: BackgroundTasks,
                     user: UserInfo | None = Depends(get_optional_user)) -> JobResponse:
    return _submit("spectral", payload.model_dump(), tasks, user, _run_spectral)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def job_status(job_id: str) -> JobStatusResponse:
    job = job_store.get_job(job_id, with_result=False)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(**job)


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
def list_candidates(
    limit: int = Query(100, ge=1, le=200), db: Session = Depends(get_db)
) -> list[CandidateItem]:
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
            snr=row.snr, quality=row.quality, evidence=evidence,
        ))
    return out


def _vetting_source(db: Session, candidate: Candidate, evidence: dict) -> dict:
    from datetime import datetime, timezone

    from astropy.time import Time

    from app.services.spherex_product import read_product
    from app.services.vetting import flag_bits_near, source_sigma_pix

    obs_a = db.get(Observation, candidate.obs_a_id) if candidate.obs_a_id else None
    obs_b = db.get(Observation, candidate.obs_b_id) if candidate.obs_b_id else None
    mjd = obs_a.t_min_mjd if obs_a is not None and obs_a.t_min_mjd else Time(
        datetime.now(timezone.utc)).mjd
    source: dict = {"ra_deg": candidate.ra_deg, "dec_deg": candidate.dec_deg, "mjd": float(mjd)}
    cutouts = evidence.get("cutouts") or []
    if cutouts:
        record = db.get(Cutout, cutouts[0])
        if record is not None and storage_exists(record.storage_key):
            product = read_product(storage_get(record.storage_key))
            source["flag_bits"] = flag_bits_near(product, candidate.ra_deg, candidate.dec_deg)
            shape = source_sigma_pix(product, candidate.ra_deg, candidate.dec_deg)
            source["sigma_pix"], source["shape_snr"] = shape if shape else (None, None)
            fwhm = product.header.get("PSF_FWHM")
            source["psf_sigma_pix"] = float(fwhm) / 6.15 / 2.355 if fwhm else None
    moving = candidate.kind == "possible moving source"
    direction = (evidence.get("detection") or {}).get("direction")
    if moving:
        source["detected_per_visit"] = [True, True]
    elif direction in ("increase", "decrease"):
        source["detected_per_visit"] = [True, False]
    astrometry = evidence.get("astrometry") or {}
    if moving and obs_a is not None and obs_b is not None and astrometry.get("ra_b_deg") is not None:
        source["positions"] = [
            (float(obs_a.t_min_mjd or mjd), astrometry["ra_a_deg"], astrometry["dec_a_deg"]),
            (float(obs_b.t_min_mjd or mjd), astrometry["ra_b_deg"], astrometry["dec_b_deg"]),
        ]
    return source


@router.post("/analysis/vet")
def vet_candidate_endpoint(payload: VetRequest, db: Session = Depends(get_db)) -> dict:
    from app.services.vetting import vet_candidate

    candidate = db.get(Candidate, payload.candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    try:
        evidence = json.loads(candidate.evidence_json or "{}")
    except ValueError:
        evidence = {}
    result = vet_candidate(_vetting_source(db, candidate, evidence))
    evidence["vetting"] = result
    candidate.evidence_json = json.dumps(evidence, default=str)
    db.commit()
    return result
