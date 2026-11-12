"""Candidate vetting: seven checks that turn a marked source into a category, never a discovery.

Each check is one of: pass, fail, info or not_checked. A check that could not run (catalogue
unreachable, too few visits) is reported as not_checked and can never push a candidate into the
"unexplained" category by omission.
"""

from typing import Any, Callable

import numpy as np

from app.services.catalogs import CatalogUnavailable, gaia_cone, gaia_position_at, skybot_cone
from app.services.spherex_product import HARD_MASK_BITS

GAIA_MATCH_ARCSEC = 3.0
SKYBOT_MATCH_ARCSEC = 20.0
SKYBOT_SEARCH_ARCSEC = 60.0

FLAG_NAMES = {
    0: "TRANSIENT", 1: "OVERFLOW", 2: "SUR_ERROR", 6: "NONFUNC", 7: "DICHROIC", 9: "MISSING_DATA",
    10: "HOT", 11: "COLD", 12: "FULLSAMPLE", 14: "PHANMISS", 15: "NONLINEAR", 17: "PERSIST",
    19: "OUTLIER", 20: "CROSSTALK", 21: "SOURCE", 22: "GHOST", 23: "GHOST_FPA", 24: "GHOST_EXT",
    25: "STREAK", 26: "BLOOM", 27: "SNOWBALL", 28: "HALO", 29: "SATELLITE_HALO",
}

CATEGORIES = {
    "known_object": "Known object",
    "artifact_likely": "Probable artifact",
    "unexplained_candidate": "Unexplained candidate",
    "inconclusive": "Inconclusive: some checks could not be run",
}


def _separation_arcsec(ra1, dec1, ra2, dec2) -> float:
    d_ra = (((ra1 - ra2) + 180.0) % 360.0 - 180.0) * np.cos(np.deg2rad(dec1))
    return float(np.hypot(d_ra, dec1 - dec2) * 3600.0)


def _check(check_name: str, status: str, summary: str, **evidence: Any) -> dict[str, Any]:
    return {"name": check_name, "status": status, "summary": summary, "evidence": evidence}


def check_gaia(ra, dec, mjd, gaia_fn) -> dict[str, Any]:
    try:
        stars = gaia_fn(ra, dec, 15.0 / 3600.0 * 2, 20.0, 100)
    except CatalogUnavailable:
        return _check("gaia_star", "not_checked", "Gaia could not be reached.")
    best = None
    for star in stars:
        pra, pdec = gaia_position_at(star, mjd)
        sep = _separation_arcsec(ra, dec, pra, pdec)
        if best is None or sep < best[0]:
            best = (sep, star)
    if best and best[0] <= GAIA_MATCH_ARCSEC:
        return _check("gaia_star", "fail", f"Matches Gaia DR3 {best[1]['source_id']} at {best[0]:.1f} arcsec.",
                      source_id=best[1]["source_id"], separation_arcsec=best[0], known=True)
    return _check("gaia_star", "pass", "No Gaia star at its expected position.",
                  nearest_arcsec=best[0] if best else None)


def check_solar_system(ra, dec, mjd, skybot_fn) -> dict[str, Any]:
    try:
        bodies = skybot_fn(ra, dec, SKYBOT_SEARCH_ARCSEC, mjd)
    except CatalogUnavailable:
        return _check("solar_system", "not_checked", "SkyBoT could not be reached.")
    near = [(b, _separation_arcsec(ra, dec, b["ra"], b["dec"])) for b in bodies]
    near = [(b, s) for b, s in near if s <= SKYBOT_MATCH_ARCSEC]
    if near:
        body, sep = min(near, key=lambda item: item[1])
        return _check("solar_system", "fail", f"Known solar-system body {body['name']} at {sep:.1f} arcsec.",
                      name=body["name"], separation_arcsec=sep, known=True)
    return _check("solar_system", "pass", "No known asteroid or comet at that position and date.")


def check_flags(flag_bits: list[int] | None) -> dict[str, Any]:
    if flag_bits is None:
        return _check("quality_flags", "not_checked", "No FLAGS data available for this source.")
    named = [{"bit": b, "name": FLAG_NAMES.get(b, "unknown")} for b in sorted(set(flag_bits))]
    hard = [n for n in named if n["bit"] in HARD_MASK_BITS]
    if hard:
        return _check("quality_flags", "fail", "Unusable-pixel flags are active: "
                      + ", ".join(h["name"] for h in hard) + ".", bits=named)
    return _check("quality_flags", "pass", "No unusable-pixel flags on its pixels.", bits=named)


def check_visits(detected_per_visit: list[bool] | None) -> dict[str, Any]:
    if not detected_per_visit:
        return _check("visits", "not_checked", "Visit detections are unknown.")
    count = int(sum(detected_per_visit))
    status = "pass" if count >= 2 else "fail"
    return _check("visits", status, f"Detected in {count} of {len(detected_per_visit)} visits.", count=count)


def check_motion(positions: list[tuple[float, float, float]] | None) -> dict[str, Any]:
    """positions: (mjd, ra, dec) per visit. Linear fit; coherent when the residuals are small."""
    if not positions or len(positions) < 3:
        return _check("coherent_motion", "not_checked", "Needs positions in at least three visits.")
    t = np.array([p[0] for p in positions], dtype=float)
    t = (t - t.mean()) / 365.25
    x = np.array([
        (((p[1] - positions[0][1]) + 180.0) % 360.0 - 180.0) * np.cos(np.deg2rad(positions[0][2])) * 3600
        for p in positions
    ])
    y = np.array([(p[2] - positions[0][2]) * 3600 for p in positions])
    fit_x, fit_y = np.polyfit(t, x, 1), np.polyfit(t, y, 1)
    rms = float(np.sqrt(np.mean((x - np.polyval(fit_x, t)) ** 2 + (y - np.polyval(fit_y, t)) ** 2)))
    speed = float(np.hypot(fit_x[0], fit_y[0]))
    coherent = rms < 3.0
    return _check("coherent_motion", "pass" if coherent else "fail",
                  f"Speed {speed:.1f} arcsec/yr with {rms:.1f} arcsec rms." if coherent
                  else "Positions do not follow a straight line.", speed_arcsec_yr=speed, rms_arcsec=rms)


def check_point_source(
    sigma_pix: float | None, psf_sigma_pix: float | None, snr: float | None = None
) -> dict[str, Any]:
    if sigma_pix is None or not psf_sigma_pix:
        return _check("point_source", "not_checked", "Source shape was not measured.")
    if snr is None or snr < 5.0:
        return _check("point_source", "not_checked", "Too faint to judge the source shape.")
    ratio = sigma_pix / psf_sigma_pix
    ok = 0.6 <= ratio <= 1.6 + 10.0 / snr
    return _check("point_source", "pass" if ok else "fail",
                  "Compatible with a point source." if ok else "Shape differs from the PSF.", ratio=ratio)


def check_colour(color: dict[str, Any] | None) -> dict[str, Any]:
    if not color or not color.get("available"):
        return _check("colour", "not_checked", "No colour measurement for this source.")
    return _check("colour", "info", color["reading"], index=color["index"])


def categorize(checks: list[dict[str, Any]]) -> tuple[str, str]:
    by_name = {c["name"]: c for c in checks}
    for name in ("gaia_star", "solar_system"):
        if by_name[name]["status"] == "fail":
            return "known_object", by_name[name]["summary"]
    flags_bad = by_name["quality_flags"]["status"] == "fail"
    one_visit = by_name["visits"]["status"] == "fail"
    shape_bad = by_name["point_source"]["status"] == "fail"
    if (flags_bad and one_visit) or (flags_bad and shape_bad):
        return "artifact_likely", "Flagged pixels and not repeated across visits."
    unchecked = [n for n in ("gaia_star", "solar_system", "quality_flags", "visits", "point_source")
                 if by_name[n]["status"] == "not_checked"]
    if unchecked:
        return "inconclusive", (
            "These checks could not be completed, so it cannot be called unexplained: "
            + ", ".join(unchecked) + "."
        )
    return "unexplained_candidate", "No catalogue match and no artifact signature; still a candidate, not a finding."


def vet_candidate(
    source: dict[str, Any],
    gaia_fn: Callable = gaia_cone,
    skybot_fn: Callable = skybot_cone,
) -> dict[str, Any]:
    ra, dec, mjd = source["ra_deg"], source["dec_deg"], source["mjd"]
    checks = [
        check_gaia(ra, dec, mjd, gaia_fn),
        check_solar_system(ra, dec, mjd, skybot_fn),
        check_flags(source.get("flag_bits")),
        check_visits(source.get("detected_per_visit")),
        check_motion(source.get("positions")),
        check_point_source(source.get("sigma_pix"), source.get("psf_sigma_pix"), source.get("shape_snr")),
        check_colour(source.get("color")),
    ]
    category, reason = categorize(checks)
    return {"category": category, "category_label": CATEGORIES[category], "reason": reason, "checks": checks}


def flag_bits_near(product, ra: float, dec: float, half: int = 1) -> list[int] | None:
    if product.flags is None:
        return None
    try:
        x, y = product.pixel_of(ra, dec)
    except ValueError:
        return None
    xi, yi = int(round(x)), int(round(y))
    window = product.flags[max(yi - half, 0): yi + half + 1, max(xi - half, 0): xi + half + 1]
    if window.size == 0:
        return None
    combined = int(np.bitwise_or.reduce(window.astype(np.int64).ravel()))
    return [bit for bit in range(32) if combined & (1 << bit)]


def source_sigma_pix(product, ra: float, dec: float, half: int = 3) -> tuple[float, float] | None:
    """(width in pixels, peak signal-to-noise) of the source near a position."""
    try:
        x, y = product.pixel_of(ra, dec)
    except ValueError:
        return None
    xi, yi = int(round(x)), int(round(y))
    window = product.science_image[max(yi - half, 0): yi + half + 1, max(xi - half, 0): xi + half + 1]
    if window.size < 9 or not np.isfinite(window).all():
        return None
    centred = window - np.median(product.science_image[np.isfinite(product.science_image)])
    noise = 1.4826 * np.median(np.abs(product.science_image - np.median(product.science_image)))
    if not noise or not np.isfinite(noise):
        return None
    weights = np.clip(centred, 0, None)
    if weights.sum() <= 0:
        return None
    yy, xx = np.mgrid[: window.shape[0], : window.shape[1]]
    cx, cy = (xx * weights).sum() / weights.sum(), (yy * weights).sum() / weights.sum()
    variance = (((xx - cx) ** 2 + (yy - cy) ** 2) * weights).sum() / weights.sum() / 2.0
    if variance <= 0:
        return None
    return float(np.sqrt(variance)), float(centred.max() / noise)
