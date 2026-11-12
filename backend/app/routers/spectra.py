"""Spectra on the fly: relative spectrophotometry of a target across every detector."""

from fastapi import APIRouter, BackgroundTasks, Depends

from app.auth import UserInfo, get_optional_user
from app.database import SessionLocal
from app.logging import get_logger
from app.routers.job_submit import submit_job
from app.routers.sequences import gateway
from app.schemas import JobResponse, SpectrumRequest
from app.services import cutout_store, jobs as job_store
from app.services.observation_store import upsert_observation
from app.services.sequence_extras import target_track, view_center
from app.services.sia2_gateway import ArchiveUnavailableError, InvalidCollectionError, query_hash
from app.services.spectral import spectrophotometry
from app.services.sequence import select_items
from app.services.spherex_product import read_product

log = get_logger("spectra")
router = APIRouter()


def run_spectrum(params: dict) -> dict:
    job_id = params["_job_id"]
    ra, dec, size = params["ra_deg"], params["dec_deg"], params["size_arcmin"]
    job_store.set_progress(job_id, "searching", 0, 4)
    try:
        found = gateway.search(ra, dec, max(size / 2.0, 1.0), maxrec=5000)
    except (ArchiveUnavailableError, InvalidCollectionError) as exc:
        raise job_store.UserFacingError(
            "The SPHEREx archive did not answer. Try again in a moment."
        ) from exc
    chosen = []
    for detector in range(1, 7):
        picked, _, _ = select_items(found["items"], detector, params["per_detector"])
        chosen.extend(picked)
    if not chosen:
        raise job_store.UserFacingError("No SPHEREx exposures cover this position.")
    centre = view_center(params, [c["t_min_mjd"] for c in chosen if c.get("t_min_mjd")])
    qhash = query_hash(ra, dec, size, ["spectrum"])
    exposures, failed = [], 0
    for index, item in enumerate(chosen):
        job_store.set_progress(job_id, "downloading", index, len(chosen))
        try:
            with SessionLocal() as db:
                observation_id = upsert_observation(db, item, qhash)
                db.commit()
                data = cutout_store.get_or_create_cutout(db, observation_id, centre[0], centre[1], size).data
            exposures.append((item, read_product(data)))
        except Exception as exc:  # noqa: BLE001 - one bad exposure must not sink the spectrum
            failed += 1
            log.warning("exposure skipped: %s", exc)
    job_store.set_progress(job_id, "measuring", len(chosen), len(chosen))
    positions, moved = target_track(params, [p.mjd_obs for _, p in exposures])
    result = spectrophotometry(exposures, ra, dec, positions)
    result["n_exposures"] = len(exposures)
    if failed:
        result["limitations"].append(f"{failed} exposure(s) could not be downloaded.")
    if not moved:
        result["limitations"].append("No proper motion known for this position: fixed-position photometry.")
    return result


@router.post("/spectra", response_model=JobResponse)
def create_spectrum(
    payload: SpectrumRequest,
    tasks: BackgroundTasks,
    user: UserInfo | None = Depends(get_optional_user),
) -> JobResponse:
    return submit_job("spectrum", payload.model_dump(), tasks, user, run_spectrum)
