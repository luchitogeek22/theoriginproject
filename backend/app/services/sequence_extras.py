"""Light curve, predicted trajectories and Gaia overlay for a rendered sequence."""

from typing import Any, Callable

import numpy as np

from app.logging import get_logger
from app.services.catalogs import CatalogUnavailable, gaia_cone, gaia_position_at
from app.services.photometry import (
    aperture_photometry,
    relative_lightcurve,
    select_comparisons,
    wing_amplitudes,
)
from app.services.sia2_gateway import _mjd_to_iso
from app.services.targets import match_known_target, propagate

log = get_logger("sequence_extras")

MAX_GAIA_STARS = 40
TARGET_EXCLUSION_PX = 4.0
UNCERTAINTY_PX = 1.5
TARGET_DETECTED_SNR = 5.0


def resolve_motion(params: dict[str, Any]) -> dict[str, Any] | None:
    if params.get("pm_ra_mas_yr") is not None and params.get("pm_dec_mas_yr") is not None:
        epoch = params.get("ref_epoch") or "J2000"
        try:
            from astropy.time import Time

            Time(epoch)
        except ValueError as exc:
            from app.services.jobs import UserFacingError

            raise UserFacingError("The reference epoch is not a valid date.") from exc
        return {
            "pmra": params["pm_ra_mas_yr"], "pmdec": params["pm_dec_mas_yr"],
            "plx": params.get("parallax_mas"), "epoch": epoch,
        }
    match = match_known_target(params["ra_deg"], params["dec_deg"])
    if match is None:
        return None
    target, epoch = match
    return {
        "pmra": target["pmra_mas_yr"], "pmdec": target["pmdec_mas_yr"],
        "plx": target.get("parallax_mas"), "epoch": epoch,
    }


def target_track(params: dict[str, Any], mjds: list[float]) -> tuple[list[tuple[float, float]], bool]:
    """Target position at each frame date, and whether proper motion was applied."""
    motion = resolve_motion(params)
    if motion is None:
        return [(params["ra_deg"], params["dec_deg"])] * len(mjds), False
    from astropy.time import Time

    track = [
        propagate(params["ra_deg"], params["dec_deg"], motion["pmra"], motion["pmdec"],
                  motion["plx"], motion["epoch"], Time(mjd, format="mjd"))
        for mjd in mjds
    ]
    return track, True


def view_center(params: dict[str, Any], mjds: list[float]) -> tuple[float, float]:
    """Where the field is centred: the target's position at the mean observation date."""
    if not mjds:
        return params["ra_deg"], params["dec_deg"]
    track, _ = target_track(params, [float(np.mean(mjds))])
    return track[0]


def _gaia_field(params: dict[str, Any], gaia_fn: Callable, center: tuple[float, float] | None = None) -> tuple[list[dict[str, Any]], str]:
    radius_deg = params["size_arcmin"] / 60.0 * 0.75
    ra, dec = center or (params["ra_deg"], params["dec_deg"])
    try:
        return gaia_fn(ra, dec, radius_deg, 17.5, 300), ""
    except CatalogUnavailable:
        return [], "Gaia could not be reached: comparison stars and catalogue marks are unavailable."


def build_lightcurve(kept, params: dict[str, Any], gaia_fn: Callable = gaia_cone) -> dict[str, Any]:
    products = [product for _, product in kept]
    mjds = [p.mjd_obs for p in products]
    track, moved = target_track(params, mjds)
    target = [aperture_photometry(p, ra, dec) for p, (ra, dec) in zip(products, track)]
    method = "aperture"
    saturated = bool(target) and sum(1 for t in target if t.get("ok") and t.get("flagged")) / len(target) >= 0.5
    if saturated and len(products) >= 3:
        wings = wing_amplitudes(products, track)
        if sum(1 for w in wings if w["ok"]) >= 3:
            target = wings
            method = "psf_wings"
    stars, warning = _gaia_field(params, gaia_fn, view_center(params, mjds))
    candidates: list[dict[str, Any]] = []
    first = products[0]
    for star in stars:
        if star["variable"]:
            continue
        ra0, dec0 = gaia_position_at(star, mjds[0])
        x, y = first.pixel_of(ra0, dec0)
        tx, ty = first.pixel_of(*track[0])
        if np.hypot(x - tx, y - ty) < TARGET_EXCLUSION_PX:
            continue
        if not (6 < x < first.image.shape[1] - 6 and 6 < y < first.image.shape[0] - 6):
            continue
        neighbours = sum(
            1 for other in stars
            if other is not star and np.hypot(*(np.subtract(first.pixel_of(*gaia_position_at(other, mjds[0])), (x, y)))) < 5.0
        )
        if neighbours:
            continue
        candidates.append({"star": star, "first": aperture_photometry(first, ra0, dec0)})
        if len(candidates) >= MAX_GAIA_STARS:
            break
    target_flux = target[0].get("flux") if target and target[0].get("ok") else None
    chosen = select_comparisons([c["first"] for c in candidates], target_flux)
    comparisons: list[list[dict[str, Any]]] = []
    for entry in candidates:
        if entry["first"] not in chosen:
            continue
        series = [
            aperture_photometry(p, *gaia_position_at(entry["star"], mjd))
            for p, mjd in zip(products, mjds)
        ]
        comparisons.append(series)
    if candidates and not comparisons:
        warning = warning or (
            f"Only {len(candidates)} Gaia star(s) were measurable here (at least 3 unflagged stars with "
            "SNR >= 10 are needed), so the curve is absolute."
        )
    curve = relative_lightcurve(mjds, target, comparisons)
    for point, mjd in zip(curve["points"], mjds):
        point["date_iso"] = _mjd_to_iso(mjd)
    notes = [warning] if warning else []
    if not moved:
        notes.append("No proper motion known for this position: photometry is at a fixed position.")
    corrected = sum(1 for t in target if t.get("psf_model") == "epsf") if method == "aperture" else 0
    curve["aperture_correction"] = {"model": "epsf" if corrected else "none", "frames": corrected, "total": len(target)}
    if corrected:
        notes.append(
            "One curve per detector; detectors are never mixed. Aperture flux corrected with the "
            f"SPHEREx ePSF in {corrected} of {len(target)} frames."
        )
    else:
        notes.append("One curve per detector; detectors are never mixed. No aperture correction.")
    curve["method"] = method
    flagged = sum(1 for t in target if t.get("ok") and t.get("flagged")) if method == "aperture" else 0
    curve["target_flagged_fraction"] = flagged / len(target) if target else 0.0
    if method == "psf_wings":
        notes.append(
            "The target saturates its core in this detector: the curve uses the amplitude of the PSF "
            "wings (relative values only, not a flux)."
        )
    if target and flagged / len(target) >= 0.5:
        notes.append(
            f"The target is flagged (saturation or unusable pixels) in {flagged} of {len(target)} frames "
            f"in detector D{products[0].detector}; try another detector, for example a longer-wavelength "
            "one for a bright star."
        )
    snrs = [t["snr"] for t in target if t.get("ok") and t.get("snr") is not None]
    curve["target_median_snr"] = float(np.median(snrs)) if snrs else None
    curve["target_detected"] = bool(snrs) and float(np.median(snrs)) >= TARGET_DETECTED_SNR
    if not curve["target_detected"]:
        notes.append(
            "The target is not detected individually in each frame (median SNR "
            f"{curve['target_median_snr']:.1f}); the curve mostly shows noise."
            if snrs else "The target could not be measured in these frames."
        )
    curve["detector"] = products[0].detector
    curve["limitations"] = notes
    return curve


def build_overlay(kept, grid, size_px: int, params: dict[str, Any], gaia_fn: Callable = gaia_cone) -> dict[str, Any]:
    mjds = [p.mjd_obs for _, p in kept]
    track, moved = target_track(params, mjds)

    def to_display(ra: float, dec: float) -> dict[str, float]:
        x, y = grid.all_world2pix([[ra, dec]], 0)[0]
        return {"x": float(x), "y": float(size_px - 1 - y)}

    overlay: dict[str, Any] = {
        "target": [{"index": i, **to_display(ra, dec)} for i, (ra, dec) in enumerate(track)],
        "uncertainty_px": UNCERTAINTY_PX,
        "proper_motion_applied": moved,
        "gaia": [],
        "gaia_available": True,
        "fov_hint": None,
    }
    if moved and len(track) >= 2:
        d_ra = (track[-1][0] - track[0][0]) * np.cos(np.deg2rad(track[0][1]))
        displacement = float(np.hypot(d_ra, track[-1][1] - track[0][1]) * 3600.0)
        overlay["displacement_arcsec"] = displacement
        half_field = params["size_arcmin"] * 60.0 / 2.0
        if displacement > half_field:
            overlay["fov_hint"] = (
                f"The target moves {displacement:.0f} arcsec over this window, more than half the field; "
                "use a larger field of view."
            )
    stars, warning = _gaia_field(params, gaia_fn, view_center(params, mjds))
    if warning:
        overlay["gaia_available"] = False
        overlay["gaia_warning"] = warning
    for star in stars[:60]:
        positions = [
            {"index": i, **to_display(*gaia_position_at(star, mjd))} for i, mjd in enumerate(mjds)
        ]
        if any(0 <= p["x"] < size_px and 0 <= p["y"] < size_px for p in positions):
            overlay["gaia"].append(
                {"source_id": star["source_id"], "g_mag": star["g_mag"], "positions": positions}
            )
    return overlay
