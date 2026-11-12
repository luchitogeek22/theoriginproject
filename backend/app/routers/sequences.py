"""Sequences: server-side flipbook of a patch of sky (search, select, download, align, render)."""

import hashlib
import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response

from app.auth import UserInfo, get_optional_user
from app.config import get_settings
from app.database import SessionLocal
from app.routers.job_submit import submit_job
import numpy as np

from app.logging import get_logger
from app.schemas import JobResponse, SequenceRequest, ShiftStackRequest
from app.services import cutout_store, jobs as job_store, shift_stack
from app.services.reference_epoch import build_reference
from app.services.sequence_extras import build_lightcurve, build_overlay, resolve_motion, view_center
from app.services.observation_store import upsert_observation
from app.services.sequence import (
    WAVELENGTH_TOLERANCE_UM,
    FrameInput,
    MOTION_RANGE,
    _to_png,
    _wavelength,
    choose_by_wavelength,
    render_sequence,
    select_items,
)
from app.services.sia2_gateway import ArchiveUnavailableError, InvalidCollectionError, SPHERExDataGateway, query_hash
from app.services.spherex_product import read_product
from app.services.store import storage_exists, storage_get, storage_put

log = get_logger("sequences_router")
router = APIRouter()
gateway = SPHERExDataGateway()

LONG_WAVELENGTH_DETECTOR = 6
KEY_PATTERN = re.compile(r"^[0-9a-fs][0-9a-f]{23}$")
IMMUTABLE = "public, max-age=31536000, immutable"


def _key(params: dict, product_ids: list[str]) -> str:
    raw = json.dumps(
        {
            "ra": round(params["ra_deg"], 6), "dec": round(params["dec_deg"], 6),
            "size": params["size_arcmin"], "mode": params["mode"],
            "detector": params.get("detector"), "max": params["max_frames"],
            "products": product_ids, "version": get_settings().processing_version,
            "pm": [params.get("pm_ra_mas_yr"), params.get("pm_dec_mas_yr"), params.get("parallax_mas")],
            "ref_epoch": params.get("ref_epoch"), "reference": bool(params.get("include_reference")),
        },
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def centre_for(params: dict, candidates: list[dict]) -> tuple[float, float]:
    mjds = [c["t_min_mjd"] for c in candidates if c.get("t_min_mjd")]
    return view_center(params, mjds)


def _frames(params: dict, candidates: list[dict], limitations: list[str], centre: tuple[float, float] | None = None) -> list[FrameInput]:
    ra, dec = centre or (params["ra_deg"], params["dec_deg"])
    size = params["size_arcmin"]
    qhash = query_hash(ra, dec, size, ["sequence"])
    frames: list[FrameInput] = []
    failed = 0
    for index, item in enumerate(candidates):
        job_store.set_progress(params["_job_id"], "downloading", index, len(candidates))
        try:
            with SessionLocal() as db:
                observation_id = upsert_observation(db, item, qhash)
                db.commit()
                if observation_id is None:
                    raise ValueError("observation could not be stored")
                result = cutout_store.get_or_create_cutout(db, observation_id, ra, dec, size)
        except Exception:  # noqa: BLE001 - one bad frame must not sink the sequence
            failed += 1
            continue
        frames.append(FrameInput(meta=item, data=result.data))
    if failed:
        limitations.append(f"{failed} frame(s) could not be downloaded and are missing.")
    params["_degraded"] = bool(failed)
    return frames


def _wavelength_filter(frames: list[FrameInput], params: dict, limitations: list[str]) -> list[FrameInput]:
    waves = [_wavelength(read_product(f.data), params["ra_deg"], params["dec_deg"]) for f in frames]
    keep = choose_by_wavelength(waves, WAVELENGTH_TOLERANCE_UM)
    if not keep:
        limitations.append("The wavelength at the target is unknown, so frames are not matched by band.")
        return frames[: params["max_frames"]]
    centre = sorted(waves[i] for i in keep)[len(keep) // 2]
    limitations.append(
        f"Brightness mode keeps frames at the same wavelength: {len(keep)} of {len(frames)} are "
        f"within ±{WAVELENGTH_TOLERANCE_UM} µm of {centre:.2f} µm."
    )
    return [frames[i] for i in keep][: params["max_frames"]]


class ArchiveDown(job_store.UserFacingError):
    pass


def _request_hash(params: dict) -> str:
    raw = json.dumps(
        {
            "ra": round(params["ra_deg"], 3), "dec": round(params["dec_deg"], 3),
            "size": params["size_arcmin"], "mode": params["mode"], "detector": params.get("detector"),
            "max": params["max_frames"], "reference": bool(params.get("include_reference")),
            "version": get_settings().processing_version,
        },
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def _from_last_good(params: dict) -> dict | None:
    pointer = f"sequences/index/{_request_hash(params)}.json"
    if not storage_exists(pointer):
        return None
    key = json.loads(storage_get(pointer)).get("key", "")
    last = f"sequences/{key}/last.json"
    if not KEY_PATTERN.match(key) or not storage_exists(last):
        return None
    result = json.loads(storage_get(last))
    result["served_from_cache"] = True
    result["cache_label"] = f"Queried on {str(result.get('queried_at', ''))[:10]}, served from cache"
    return result


def _gather(params: dict, pool: int, first_stage: int = 0):
    job_id = params["_job_id"]
    ra, dec, size = params["ra_deg"], params["dec_deg"], params["size_arcmin"]
    job_store.set_progress(job_id, "searching", first_stage, first_stage + 5)
    try:
        found = gateway.search(ra, dec, max(size / 2.0, 1.0), maxrec=5000)
    except (ArchiveUnavailableError, InvalidCollectionError) as exc:
        raise ArchiveDown("The SPHEREx archive did not answer. Try again in a moment.") from exc
    limitations = [f"Archive notice: {w}" for w in found.get("warnings", [])]
    job_store.set_progress(job_id, "selecting", first_stage + 1, first_stage + 5)
    requested = params.get("detector")
    preferred = requested or (LONG_WAVELENGTH_DETECTOR if params.get("mode") == "motion" else None)
    candidates, n_available, notes = select_items(found["items"], preferred, pool)
    if not candidates and preferred and not requested:
        candidates, n_available, notes = select_items(found["items"], None, pool)
    elif candidates and preferred and not requested:
        notes.append(
            "Motion mode uses detector D6 (about 4.4 to 5 µm) by default: cold objects such as "
            "brown dwarfs are brightest at long wavelengths."
        )
    limitations.extend(notes)
    return candidates, n_available, limitations


def run_sequence(params: dict) -> dict:
    try:
        return _run_sequence(params)
    except ArchiveDown:
        fallback = _from_last_good(params)
        if fallback is None:
            raise
        return fallback


def _run_sequence(params: dict) -> dict:
    job_id = params["_job_id"]
    ra, dec, size = params["ra_deg"], params["dec_deg"], params["size_arcmin"]
    pool = params["max_frames"] * (2 if params["mode"] == "brightness" else 1)
    candidates, n_available, limitations = _gather(params, pool)
    key = _key(params, [c["product_id"] for c in candidates])
    cached = f"sequences/{key}/result.json"
    if storage_exists(cached):
        return json.loads(storage_get(cached))

    centre = centre_for(params, candidates)
    job_store.set_progress(job_id, "downloading", 2, 6)
    frames = _frames(params, candidates, limitations, centre)
    if not frames and candidates:
        raise ArchiveDown("The SPHEREx cutout service did not answer. Try again in a moment.")
    if params["mode"] == "brightness" and len(frames) > 1:
        frames = _wavelength_filter(frames, {**params, "ra_deg": centre[0], "dec_deg": centre[1]}, limitations)

    job_store.set_progress(job_id, "rendering", 3, 6)
    rendered = render_sequence(frames, centre[0], centre[1], size, params["mode"])
    result = rendered.result
    result["n_available"] = max(n_available, result["n_available"])
    result["key"] = key
    for index, png in enumerate(rendered.pngs):
        storage_put(f"sequences/{key}/frame_{index}.png", png)
        result["frames"][index]["png_url"] = f"/api/v1/sequences/{key}/frames/{index}.png"

    if rendered.kept:
        job_store.set_progress(job_id, "photometry", 4, 6)
        size_px = result["grid"]["size_px"]
        for name, build in (
            ("lightcurve", lambda: build_lightcurve(rendered.kept, params)),
            ("overlay", lambda: build_overlay(rendered.kept, rendered.grid, size_px, params)),
        ):
            try:
                result[name] = build()
            except Exception as exc:  # noqa: BLE001 - extras never sink the sequence
                params["_degraded"] = True
                limitations.append(f"The {name} could not be computed.")
                log.warning("%s failed: %s", name, exc)
        if params.get("include_reference"):
            job_store.set_progress(job_id, "reference frame", 5, 6)
            reference = build_reference(
                centre[0], centre[1], size, result["frames"][0]["wavelength_um"], rendered.grid, size_px,
                downloader=lambda url, hint: cutout_store.gateway.download(url, dest_hint=hint),
            )
            if reference:
                png = reference.pop("png")
                storage_put(f"sequences/{key}/reference.png", png)
                reference["png_url"] = f"/api/v1/sequences/{key}/reference.png"
                result["reference"] = reference
            else:
                params["_degraded"] = True
                limitations.append("The WISE reference frame could not be retrieved.")
    overlay = result.get("overlay") or {}
    if overlay.get("gaia_available") is False or "lightcurve" not in result and rendered.kept:
        params["_degraded"] = True
    result["limitations"] = limitations + result["limitations"]
    result["queried_at"] = datetime.now(timezone.utc).isoformat()
    if result["n_used"] > 0:
        storage_put(f"sequences/{key}/last.json", json.dumps(result, default=str).encode())
        storage_put(
            f"sequences/index/{_request_hash(params)}.json", json.dumps({"key": key}).encode()
        )
    if not params.get("_degraded"):
        storage_put(cached, json.dumps(result, default=str).encode())
    return result


def run_shift_stack(params: dict) -> dict:
    job_id = params["_job_id"]
    ra, dec, size = params["ra_deg"], params["dec_deg"], params["size_arcmin"]
    candidates, n_available, limitations = _gather({**params, "mode": "motion"}, params["max_frames"])
    stack_params = {**params, "mode": f"shift:{params['max_speed_arcsec_yr']}:{params['steps']}"}
    key = "s" + _key(stack_params, [c["product_id"] for c in candidates])[1:]
    cached = f"sequences/{key}/stack.json"
    if storage_exists(cached):
        return json.loads(storage_get(cached))
    centre = centre_for(params, candidates)
    job_store.set_progress(job_id, "downloading", 2, 6)
    frames = _frames(params, candidates, limitations, centre)
    job_store.set_progress(job_id, "aligning", 3, 6)
    rendered = render_sequence(frames, centre[0], centre[1], size, "motion")
    usable = [w for w in rendered.warped if w["variance"] is not None]
    job_store.set_progress(job_id, "searching velocities", 4, 6)
    outcome = shift_stack.search(
        [w["image"] for w in usable], [w["variance"] for w in usable], [w["mjd"] for w in usable],
        max_speed_arcsec_yr=params["max_speed_arcsec_yr"], steps=params["steps"],
    )
    targeted = None
    motion = resolve_motion(params)
    if motion and usable:
        size_px = rendered.result["grid"]["size_px"]
        targeted = shift_stack.targeted_check(
            [w["image"] for w in usable], [w["variance"] for w in usable], [w["mjd"] for w in usable],
            motion["pmra"], motion["pmdec"], ((size_px - 1) / 2.0, (size_px - 1) / 2.0),
        )
        targeted.pop("_stack_error", None)
        targeted_mean = targeted.pop("_stack_mean", None)
        if targeted_mean is not None:
            noise = float(np.nanmedian(np.abs(targeted_mean - np.nanmedian(targeted_mean))) * 1.4826)
            display = targeted_mean / noise if noise and np.isfinite(noise) else targeted_mean
            storage_put(f"sequences/{key}/known_motion.png", _to_png(display, MOTION_RANGE[0], MOTION_RANGE[1]))
            targeted["stack_png_url"] = f"/api/v1/sequences/{key}/known_motion.png"
    mean = outcome.pop("_stack_mean", None)
    error = outcome.pop("_stack_error", None)
    result = {
        **outcome, "key": key, "n_available": n_available, "mode": "shift-stack",
        "detector": rendered.result["frames"][0]["detector"] if rendered.result["frames"] else None,
        "targeted": targeted,
        "limitations": limitations + rendered.result["limitations"] + outcome.get("limitations", []),
    }
    if mean is not None:
        with np.errstate(invalid="ignore"):
            noise = float(np.nanmedian(error))
        display = mean / noise if noise and np.isfinite(noise) else mean
        storage_put(f"sequences/{key}/stack.png", _to_png(display, MOTION_RANGE[0], MOTION_RANGE[1]))
        result["stack_png_url"] = f"/api/v1/sequences/{key}/stack.png"
    if not params.get("_degraded"):
        storage_put(cached, json.dumps(result, default=str).encode())
    return result


@router.post("/sequences", response_model=JobResponse)
def create_sequence(
    payload: SequenceRequest,
    tasks: BackgroundTasks,
    user: UserInfo | None = Depends(get_optional_user),
) -> JobResponse:
    return submit_job("sequence", payload.model_dump(), tasks, user, run_sequence)


@router.post("/sequences/shift-stack", response_model=JobResponse)
def create_shift_stack(
    payload: ShiftStackRequest,
    tasks: BackgroundTasks,
    user: UserInfo | None = Depends(get_optional_user),
) -> JobResponse:
    return submit_job("shift-stack", payload.model_dump(), tasks, user, run_shift_stack)


@router.get("/sequences/{key}/{name}.png")
def named_png(key: str, name: str) -> Response:
    if name not in ("stack", "reference", "known_motion"):
        raise HTTPException(status_code=404, detail="Image not available")
    storage_key = f"sequences/{key}/{name}.png"
    if not KEY_PATTERN.match(key) or not storage_exists(storage_key):
        raise HTTPException(status_code=404, detail="Image not available")
    return Response(content=storage_get(storage_key), media_type="image/png",
                    headers={"Cache-Control": IMMUTABLE})


@router.get("/sequences/{key}/frames/{index}.png")
def frame_png(key: str, index: int) -> Response:
    storage_key = f"sequences/{key}/frame_{index}.png"
    if not KEY_PATTERN.match(key) or index < 0 or not storage_exists(storage_key):
        raise HTTPException(status_code=404, detail="Frame not available")
    return Response(
        content=storage_get(storage_key), media_type="image/png",
        headers={"Cache-Control": IMMUTABLE},
    )
