"""Sequence engine: aligned, consistently scaled frames of one patch of sky over time.

Frames of ONE detector are reprojected onto a common tangent-plane grid (north up, east left),
background-subtracted and rendered with a scale that is stated and shared:
  brightness - one physical (lo, hi) pair for the whole sequence, so changes in brightness show;
  motion     - every frame in units of its own noise, so faint movers stand out; not comparable
               in brightness between frames.
"""

import io
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from app.config import get_settings
from app.logging import get_logger
from app.services.sia2_gateway import _mjd_to_iso
from app.services.spherex_product import read_product

log = get_logger("sequence")

PIXEL_SCALE_ARCSEC = 6.15
NEUTRAL_RGB = (58, 66, 84)
MOTION_RANGE = (-3.0, 8.0)
WAVELENGTH_TOLERANCE_UM = 0.06


@dataclass
class FrameInput:
    meta: dict[str, Any]
    data: bytes


@dataclass
class RenderedSequence:
    result: dict[str, Any]
    pngs: list[bytes] = field(default_factory=list)
    images: list[np.ndarray] = field(default_factory=list)
    kept: list = field(default_factory=list)
    grid: Any = None
    warped: list = field(default_factory=list)


def common_grid(ra_deg: float, dec_deg: float, size_arcmin: float):
    from astropy.wcs import WCS  # type: ignore[import-untyped]

    n = max(8, int(round(size_arcmin * 60.0 / PIXEL_SCALE_ARCSEC)))
    scale = PIXEL_SCALE_ARCSEC / 3600.0
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crval = [ra_deg, dec_deg]
    wcs.wcs.crpix = [n / 2 + 0.5, n / 2 + 0.5]
    wcs.wcs.cdelt = [-scale, scale]
    return wcs, n


def select_items(
    items: list[dict[str, Any]], detector: int | None, max_frames: int
) -> tuple[list[dict[str, Any]], int, list[str]]:
    """Pick the products of one detector, oldest first, at most max_frames evenly spread."""
    limitations: list[str] = []
    available = len(items)
    with_detector = [i for i in items if i.get("detector")]
    missing = available - len(with_detector)
    if missing:
        limitations.append(f"{missing} product(s) without a detector were excluded.")
    groups: dict[int, list[dict[str, Any]]] = {}
    for item in with_detector:
        groups.setdefault(int(item["detector"]), []).append(item)
    if detector is not None:
        if detector not in groups:
            limitations.append(f"No products for detector D{detector} at this position.")
            return [], available, limitations
        chosen_det = detector
    elif groups:
        chosen_det = max(groups, key=lambda d: (len({i.get("t_min_mjd") for i in groups[d]}), -d))
    else:
        limitations.append("No products with a known detector at this position.")
        return [], available, limitations
    others = sorted(d for d in groups if d != chosen_det)
    if others:
        limitations.append(
            f"Detectors {', '.join('D' + str(d) for d in others)} were excluded: a sequence uses "
            f"one detector (D{chosen_det}) because SPHEREx detectors cannot be mixed."
        )
    chosen = sorted(groups[chosen_det], key=lambda i: i.get("t_min_mjd") or 0.0)
    if len(chosen) > max_frames:
        idx = np.unique(np.linspace(0, len(chosen) - 1, max_frames).round().astype(int))
        limitations.append(
            f"{len(chosen)} epochs available; {len(idx)} evenly spaced ones are shown "
            f"(maximum {max_frames})."
        )
        chosen = [chosen[i] for i in idx]
    return chosen, available, limitations


def choose_by_wavelength(wavelengths: list[float | None], tolerance_um: float) -> list[int]:
    """Indices of the largest group whose wavelengths lie within +-tolerance of one centre."""
    known = [(i, w) for i, w in enumerate(wavelengths) if w is not None and np.isfinite(w)]
    best: list[int] = []
    for _, centre in known:
        group = [i for i, w in known if abs(w - centre) <= tolerance_um]
        if len(group) > len(best):
            best = group
    return sorted(best)


def spread_evenly(indices: list[int], n: int) -> list[int]:
    """At most n of the (time-ordered) indices, evenly spaced so the first and last are kept."""
    if len(indices) <= n:
        return list(indices)
    picks = np.unique(np.linspace(0, len(indices) - 1, n).round().astype(int))
    return [indices[i] for i in picks]


def _robust_sigma(values: np.ndarray) -> float:
    values = values[np.isfinite(values)]
    if values.size == 0:
        return float("nan")
    return float(1.4826 * np.median(np.abs(values - np.median(values))))


def _wavelength(product, ra_deg: float, dec_deg: float) -> float | None:
    try:
        x, y = product.pixel_of(ra_deg, dec_deg)
        wave, _ = product.wavelength_at(x, y)
        return float(wave) if np.isfinite(wave) else None
    except Exception:  # noqa: BLE001 - unknown wavelength is reported as null
        return None


def _to_png(values: np.ndarray, lo: float, hi: float) -> bytes:
    from PIL import Image  # type: ignore[import-untyped]

    scaled = np.clip((values - lo) / (hi - lo), 0.0, 1.0)
    level = np.round(np.nan_to_num(scaled) * 255).astype(np.uint8)
    rgb = np.stack([level, level, level], axis=-1)
    rgb[~np.isfinite(values)] = NEUTRAL_RGB
    buffer = io.BytesIO()
    Image.fromarray(np.flipud(rgb), "RGB").save(buffer, format="PNG")
    return buffer.getvalue()


def reproject_frames(kept, grid, n: int, ra_deg: float, dec_deg: float) -> list[dict[str, Any]]:
    """Background-subtract each (frame, product) and resample image and variance onto the grid."""
    from astropy.stats import sigma_clipped_stats  # type: ignore[import-untyped]
    from reproject import reproject_interp  # type: ignore[import-untyped]

    warped: list[dict[str, Any]] = []
    for frame, product in kept:
        valid = product.quality_mask
        science = np.where(valid, product.science_image, np.nan)
        if valid.any():
            _, background, _ = sigma_clipped_stats(science[valid], sigma=3.0)
            science = science - background
        out, footprint = reproject_interp((science, product.wcs), grid, shape_out=(n, n))
        out = np.asarray(out, dtype=float)
        variance = None
        if product.variance is not None:
            var_native = np.where(valid, product.variance, np.nan)
            variance, _ = reproject_interp((var_native, product.wcs), grid, shape_out=(n, n))
            variance = np.asarray(variance, dtype=float)
        warped.append({
            "image": out,
            "variance": variance,
            "sigma": _robust_sigma(out),
            "mjd": product.mjd_obs,
            "wavelength_um": _wavelength(product, ra_deg, dec_deg),
            "flagged_fraction": float(1.0 - valid.mean()),
            "coverage_fraction": float(np.mean(np.asarray(footprint) > 0)),
        })
    return warped


def motion_shifts(
    mjds: list[float], pm_ra_mas_yr: float, pm_dec_mas_yr: float, ref_mjd: float,
    pixel_scale_arcsec: float = PIXEL_SCALE_ARCSEC,
) -> list[tuple[float, float]]:
    """(dy, dx) pixel shifts that undo a proper motion so a mover lines up at ref_mjd."""
    shifts = []
    for mjd in mjds:
        years = (mjd - ref_mjd) / 365.25
        dx = -(pm_ra_mas_yr * years / 1000.0) / pixel_scale_arcsec
        dy = (pm_dec_mas_yr * years / 1000.0) / pixel_scale_arcsec
        shifts.append((-dy, -dx))
    return shifts


def stack_weighted(
    images: list[np.ndarray],
    variances: list[np.ndarray],
    shifts: list[tuple[float, float]] | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Inverse-variance weighted mean and its 1-sigma error; optional (dy, dx) shift per frame."""
    from scipy.ndimage import shift as nd_shift  # type: ignore[import-untyped]

    numerator = np.zeros_like(images[0], dtype=float)
    denominator = np.zeros_like(images[0], dtype=float)
    for k, (image, variance) in enumerate(zip(images, variances)):
        valid = np.isfinite(image) & np.isfinite(variance) & (variance > 0)
        weight = np.where(valid, 1.0 / np.where(valid, variance, 1.0), 0.0)
        weighted = np.where(valid, image, 0.0) * weight
        if shifts is not None and any(shifts[k]):
            weighted = nd_shift(weighted, shifts[k], order=1, mode="constant", cval=0.0)
            weight = nd_shift(weight, shifts[k], order=1, mode="constant", cval=0.0)
        numerator += weighted
        denominator += weight
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = np.where(denominator > 0, numerator / denominator, np.nan)
        error = np.where(denominator > 0, 1.0 / np.sqrt(denominator), np.nan)
    return mean, error


def render_sequence(
    frames: list[FrameInput],
    ra_deg: float,
    dec_deg: float,
    size_arcmin: float,
    mode: str,
    hi_percentile: float = 99.9,
) -> RenderedSequence:
    limitations: list[str] = []
    grid, n = common_grid(ra_deg, dec_deg, size_arcmin)
    n_available = len(frames)

    products = []
    for frame in frames:
        product = read_product(frame.data)
        products.append((frame, product))
    by_detector: dict[int | None, list] = {}
    for frame, product in products:
        by_detector.setdefault(product.detector, []).append((frame, product))
    missing = by_detector.pop(None, [])
    if missing:
        limitations.append(f"{len(missing)} frame(s) without a detector were excluded.")
    kept: list = []
    if by_detector:
        chosen = max(by_detector, key=lambda d: (len(by_detector[d]), -d))
        kept = by_detector[chosen]
        others = sorted(d for d in by_detector if d != chosen)
        if others:
            limitations.append(
                f"Frames from detector(s) {', '.join('D' + str(d) for d in others)} were excluded: "
                f"a sequence uses one detector (D{chosen}); detectors cannot be mixed."
            )
    kept.sort(key=lambda fp: fp[1].mjd_obs if fp[1].mjd_obs is not None else 0.0)

    if not kept:
        limitations.append("No frames available to build a sequence at this position.")
    elif len(kept) == 1:
        limitations.append("Only one epoch is available, so nothing can change over time here.")

    warped = reproject_frames(kept, grid, n, ra_deg, dec_deg)
    reprojected = [w["image"] for w in warped]
    sigmas = [w["sigma"] for w in warped]
    meta_rows = []
    for index, (w, (frame, product)) in enumerate(zip(warped, kept)):
        mjd = product.mjd_obs
        meta_rows.append({
            "index": index,
            "obs_id": str(frame.meta.get("obs_id") or product.obs_id),
            "collection": str(frame.meta.get("collection", "")),
            "t_mid_mjd": mjd,
            "date_iso": _mjd_to_iso(mjd),
            "detector": product.detector,
            "wavelength_um": w["wavelength_um"],
            "png_url": "",
            "flagged_fraction": w["flagged_fraction"],
            "coverage_fraction": w["coverage_fraction"],
        })

    if mode == "brightness":
        finite = np.concatenate([r[np.isfinite(r)] for r in reprojected]) if reprojected else np.array([])
        sigma_ref = float(np.nanmedian(sigmas)) if sigmas else 1.0
        sigma_ref = sigma_ref if np.isfinite(sigma_ref) and sigma_ref > 0 else 1.0
        lo = -3.0 * sigma_ref
        hi = max(float(np.percentile(finite, hi_percentile)) if finite.size else 0.0, 10.0 * sigma_ref)
        unit = get_unit(kept)
        shown = reprojected
        note = "One physical scale for all frames: brightness changes between frames are real."
    else:
        lo, hi = MOTION_RANGE
        unit = "sigma"
        shown = [
            r / s if np.isfinite(s) and s > 0 else np.full_like(r, np.nan)
            for r, s in zip(reprojected, sigmas)
        ]
        note = (
            "Each frame is shown in units of its own noise: use it to spot motion, "
            "not to compare brightness between frames."
        )
    limitations.append(note)
    pngs = [_to_png(image, lo, hi) for image in shown]

    result = {
        "mode": mode,
        "frames": meta_rows,
        "scale": {"mode": mode, "lo": lo, "hi": hi, "unit": unit},
        "grid": {
            "ra_deg": ra_deg,
            "dec_deg": dec_deg,
            "pixel_scale_arcsec": PIXEL_SCALE_ARCSEC,
            "size_px": n,
            "orientation": "north up, east left",
        },
        "n_available": n_available,
        "n_used": len(meta_rows),
        "limitations": limitations,
        "processing_version": get_settings().processing_version,
    }
    return RenderedSequence(result=result, pngs=pngs, images=shown, kept=kept, grid=grid, warped=warped)


def get_unit(kept) -> str:
    return kept[0][1].bunit.replace(" ", "") if kept and kept[0][1].bunit else "MJy/sr"
