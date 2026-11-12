"""Shift-and-stack search for slow movers ("Planet X mode").

Visits of ONE detector, already on a common grid, are shifted along every trial velocity and
combined with inverse-variance weights. The best velocity is reported with its significance
corrected for the number of trials (velocities x pixels), so a lucky noise peak is not sold as a
detection. Static sources are removed first with a per-pixel median over the visits, which keeps
movers that cross several pixels but cannot recover movers slower than about one PSF in total.
"""

from typing import Any

import numpy as np
from scipy.ndimage import binary_dilation, gaussian_filter, label  # type: ignore[import-untyped]
from scipy.stats import norm  # type: ignore[import-untyped]

from app.services.sequence import PIXEL_SCALE_ARCSEC, motion_shifts, stack_weighted

MIN_VISITS = 3
STATIC_SIGMA = 4.0
STATIC_DILATION_PX = 2
MIN_DISPLACEMENT_PX = 1.5
WORK_BUDGET = 6e7
SIGMA_CAP = 40.0
SYSTEMATIC_PX = 0.3
EDGE_MARGIN_PX = 3


def speed_axis(max_speed_arcsec_yr: float, steps: int) -> np.ndarray:
    steps = max(3, steps | 1)
    return np.linspace(-max_speed_arcsec_yr, max_speed_arcsec_yr, steps)


def matched_filter_significance(mean: np.ndarray, error: np.ndarray, psf_sigma_pix: float) -> np.ndarray:
    """Significance of a Gaussian point source of known width at every pixel."""
    valid = np.isfinite(mean) & np.isfinite(error) & (error > 0)
    weight = np.where(valid, 1.0 / np.where(valid, error, 1.0) ** 2, 0.0)
    data = np.where(valid, mean, 0.0) * weight
    sigma_sq = psf_sigma_pix / np.sqrt(2.0)
    numerator = 2 * np.pi * psf_sigma_pix**2 * gaussian_filter(data, psf_sigma_pix, mode="constant")
    denominator = 2 * np.pi * sigma_sq**2 * gaussian_filter(weight, sigma_sq, mode="constant")
    with np.errstate(invalid="ignore", divide="ignore"):
        significance = numerator / np.sqrt(denominator)
    significance[denominator <= 0] = np.nan
    return significance


def corrected_sigma(raw_sigma: float, trials: int) -> tuple[float, float]:
    """(corrected significance, corrected one-sided p-value) under a Bonferroni trials factor."""
    p_single = float(norm.sf(raw_sigma))
    p_corrected = min(1.0, p_single * trials)
    if p_corrected >= 1.0:
        return 0.0, 1.0
    return min(float(norm.isf(p_corrected)), SIGMA_CAP), p_corrected


def remove_static(
    images: list[np.ndarray], variances: list[np.ndarray], protect: np.ndarray | None = None
) -> list[np.ndarray]:
    """Subtract bright static sources, each with its own gain per visit. `protect` pixels are kept."""
    cube = np.array([np.where(np.isfinite(im), im, np.nan) for im in images])
    static = np.nanmedian(cube, axis=0)
    sigma_pixel = np.nanmedian(
        np.sqrt(np.array([np.where(np.isfinite(v), v, np.nan) for v in variances])), axis=0
    )
    sigma_median = 1.2533 * sigma_pixel / np.sqrt(len(images))
    bright = np.isfinite(static) & np.isfinite(sigma_median) & (static > STATIC_SIGMA * sigma_median)
    bright = binary_dilation(bright, iterations=STATIC_DILATION_PX) & np.isfinite(static)
    if protect is not None:
        bright &= ~protect
    labels, n_sources = label(bright)
    reference = np.where(bright, static, 0.0)
    cleaned = []
    for im in images:
        scaled = np.zeros_like(reference)
        for k in range(1, n_sources + 1):
            region = labels == k
            good = region & np.isfinite(im)
            norm = float((reference[good] ** 2).sum())
            if norm > 0:
                gain = float(np.clip((im[good] * reference[good]).sum() / norm, 0.0, 3.0))
                scaled[region] = gain * reference[region]
        cleaned.append(im - scaled)
    return cleaned


def measure_motion(
    images: list[np.ndarray],
    variances: list[np.ndarray],
    mjds: list[float],
    pm_ra_mas_yr: float,
    pm_dec_mas_yr: float,
    centre_xy: tuple[float, float],
    psf_sigma_pix: float = 0.6,
    pixel_scale_arcsec: float = PIXEL_SCALE_ARCSEC,
    threshold: float = 4.0,
) -> dict[str, Any]:
    """Measured displacement of the target between the early and late halves vs the predicted one."""
    from app.services.temporal import TemporalAnalysisEngine

    if len(images) < 4:
        return {"measurable": False, "reason": "At least 4 visits are needed to compare two halves."}
    order = np.argsort(mjds)
    images = [images[i] for i in order]
    variances = [variances[i] for i in order]
    mjds = [mjds[i] for i in order]
    ref_mjd = float(np.mean(mjds))
    half = len(images) // 2
    groups = [(images[:half], variances[:half], mjds[:half]), (images[-half:], variances[-half:], mjds[-half:])]
    height, width = images[0].shape
    yy, xx = np.mgrid[:height, :width]

    def expected_xy(mjd: float) -> tuple[float, float]:
        years = (mjd - ref_mjd) / 365.25
        dx = -(pm_ra_mas_yr * years / 1000.0) / pixel_scale_arcsec
        dy = (pm_dec_mas_yr * years / 1000.0) / pixel_scale_arcsec
        return centre_xy[0] + dx, centre_xy[1] + dy

    protect = np.zeros((height, width), dtype=bool)
    for mjd in mjds:
        ex, ey = expected_xy(mjd)
        protect |= (xx - ex) ** 2 + (yy - ey) ** 2 <= 3.0**2
    cleaned_all = remove_static(images, variances, protect=protect)
    cleaned = [cleaned_all[:half], cleaned_all[-half:]]

    found = []
    mean_epochs = []
    for (_, group_var, group_mjds), group_images in zip(groups, cleaned):
        epoch = float(np.mean(group_mjds))
        mean_epochs.append(epoch)
        ex, ey = expected_xy(epoch)
        shifts = motion_shifts(group_mjds, pm_ra_mas_yr, pm_dec_mas_yr, epoch, pixel_scale_arcsec)
        mean, error = stack_weighted(group_images, group_var, shifts)
        valid = np.isfinite(mean) & np.isfinite(error) & (error > 0)
        source = TemporalAnalysisEngine._find_source(
            np.where(valid, mean, 0.0), valid, error**2, ex, ey, psf_sigma_pix, 3.0, threshold
        )
        if source is None:
            return {"measurable": False, "reason": "The target is too faint to locate in each half of the visits."}
        found.append((source, (ex, ey)))
    (early, early_expected), (late, late_expected) = found
    baseline_years = (mean_epochs[1] - mean_epochs[0]) / 365.25
    east = -((late[0] - late_expected[0]) - (early[0] - early_expected[0])) * pixel_scale_arcsec
    north = ((late[1] - late_expected[1]) - (early[1] - early_expected[1])) * pixel_scale_arcsec
    measured_east = pm_ra_mas_yr * baseline_years / 1000.0 + east
    measured_north = pm_dec_mas_yr * baseline_years / 1000.0 + north
    predicted_east = pm_ra_mas_yr * baseline_years / 1000.0
    predicted_north = pm_dec_mas_yr * baseline_years / 1000.0
    statistical = float(np.hypot(early[3], late[3])) * pixel_scale_arcsec
    sigma = float(np.hypot(statistical, SYSTEMATIC_PX * pixel_scale_arcsec))
    return {
        "measurable": True,
        "baseline_days": baseline_years * 365.25,
        "predicted_east_arcsec": predicted_east,
        "predicted_north_arcsec": predicted_north,
        "predicted_arcsec": float(np.hypot(predicted_east, predicted_north)),
        "measured_east_arcsec": float(measured_east),
        "measured_north_arcsec": float(measured_north),
        "measured_arcsec": float(np.hypot(measured_east, measured_north)),
        "difference_arcsec": float(np.hypot(measured_east - predicted_east, measured_north - predicted_north)),
        "uncertainty_arcsec": sigma,
        "statistical_arcsec": statistical,
        "systematic_arcsec": SYSTEMATIC_PX * pixel_scale_arcsec,
    }


def targeted_check(
    images: list[np.ndarray],
    variances: list[np.ndarray],
    mjds: list[float],
    pm_ra_mas_yr: float,
    pm_dec_mas_yr: float,
    centre_xy: tuple[float, float],
    psf_sigma_pix: float = 0.6,
    radius_px: float = 1.5,
    n_null: int = 4000,
    seed: int = 0,
    pixel_scale_arcsec: float = PIXEL_SCALE_ARCSEC,
) -> dict[str, Any]:
    """Stack along a KNOWN proper motion and test the predicted position against random positions."""
    from app.services.sequence import stack_weighted as _stack

    limitations: list[str] = []
    if len(images) < MIN_VISITS:
        return {"ok": False, "n_visits": len(images),
                "limitations": [f"At least {MIN_VISITS} visits are required; found {len(images)}."]}
    order = np.argsort(mjds)
    images = [images[i] for i in order]
    variances = [variances[i] for i in order]
    mjds = [mjds[i] for i in order]
    ref_mjd = float(np.mean(mjds))
    shifts = motion_shifts(mjds, pm_ra_mas_yr, pm_dec_mas_yr, ref_mjd, pixel_scale_arcsec)
    height, width = images[0].shape
    yy, xx = np.mgrid[:height, :width]
    protect = np.zeros((height, width), dtype=bool)
    for (dy, dx) in shifts:
        protect |= (xx - (centre_xy[0] - dx)) ** 2 + (yy - (centre_xy[1] - dy)) ** 2 <= 3.0**2
    cleaned = remove_static(images, variances, protect=protect)
    mean, error = _stack(cleaned, variances, shifts)
    significance = matched_filter_significance(mean, error, psf_sigma_pix)

    def peak_near(x: float, y: float) -> float:
        window = (xx - x) ** 2 + (yy - y) ** 2 <= radius_px**2
        values = significance[window]
        values = values[np.isfinite(values)]
        return float(values.max()) if values.size else float("nan")

    observed = peak_near(*centre_xy)
    margin = 6.0
    positions = [
        (x, y)
        for y in range(int(margin), height - int(margin))
        for x in range(int(margin), width - int(margin))
        if np.hypot(x - centre_xy[0], y - centre_xy[1]) >= margin
    ]
    if len(positions) > n_null:
        chosen = np.random.default_rng(seed).choice(len(positions), size=n_null, replace=False)
        positions = [positions[i] for i in chosen]
    null = [v for v in (peak_near(x, y) for x, y in positions) if np.isfinite(v)]
    if len(null) < 50 or not np.isfinite(observed):
        return {"ok": False, "n_visits": len(images),
                "limitations": ["Not enough clean sky around the target to calibrate the test."]}
    p_value = (1 + sum(v >= observed for v in null)) / (1 + len(null))
    window = (xx - centre_xy[0]) ** 2 + (yy - centre_xy[1]) ** 2 <= radius_px**2
    peak_idx = np.unravel_index(np.nanargmax(np.where(window, significance, -np.inf)), significance.shape)
    total_motion_px = float(np.hypot(*[(shifts[-1][i] - shifts[0][i]) for i in (0, 1)]))
    limitations.append(
        "The empirical p-value compares the predicted position with random positions in the same "
        "stack; it assumes the catalogue proper motion is correct and the motion is linear."
    )
    limitations.append(
        f"Total predicted motion over the window is {total_motion_px:.1f} px: below about 1.5 px a "
        "blind search cannot separate a mover from a static source, but a known motion can be checked."
    )
    return {
        "ok": True,
        "n_visits": len(images),
        "observed_sigma": observed,
        "p_value": float(p_value),
        "sigma_equivalent": min(float(norm.isf(p_value)), SIGMA_CAP),
        "n_null": len(null),
        "peak_xy": [int(peak_idx[1]), int(peak_idx[0])],
        "offset_px": float(np.hypot(peak_idx[1] - centre_xy[0], peak_idx[0] - centre_xy[1])),
        "predicted_motion_px": total_motion_px,
        "limitations": limitations,
        "_stack_mean": mean,
        "_stack_error": error,
    }


def search(
    images: list[np.ndarray],
    variances: list[np.ndarray],
    mjds: list[float],
    max_speed_arcsec_yr: float,
    steps: int = 11,
    psf_sigma_pix: float = 0.6,
    subtract_static: bool = True,
    threshold_sigma: float = 3.0,
    max_combinations: int = 2500,
    pixel_scale_arcsec: float = PIXEL_SCALE_ARCSEC,
) -> dict[str, Any]:
    limitations = [
        "Linear motion over the observation window is assumed; this is an approximation that "
        "holds for distant objects over about a year and a half."
    ]
    if len(images) < MIN_VISITS:
        limitations.append(f"At least {MIN_VISITS} visits are required; found {len(images)}.")
        return {"ok": False, "n_visits": len(images), "limitations": limitations}
    pixels = images[0].size
    while steps > 3 and steps**2 * len(images) * pixels > WORK_BUDGET:
        steps -= 2
        if steps**2 <= max_combinations:
            limitations.append(f"Velocity grid reduced to {steps}x{steps} to bound the computing cost.")
    axis = speed_axis(max_speed_arcsec_yr, steps)
    if len(axis) ** 2 > max_combinations:
        limitations.append(f"Velocity grid capped at {max_combinations} combinations.")
        axis = speed_axis(max_speed_arcsec_yr, int(np.sqrt(max_combinations)))
    order = np.argsort(mjds)
    images = [images[i] for i in order]
    variances = [variances[i] for i in order]
    mjds = [mjds[i] for i in order]
    ref_mjd = float(np.mean(mjds))

    if subtract_static:
        images = remove_static(images, variances)
        limitations.append(
            "Pixels that are significantly bright in the median of all visits were treated as static "
            "sources and subtracted, each source with its own brightness per visit; movers slower "
            "than about one PSF across the window can be removed with them."
        )

    height, width = images[0].shape
    interior = np.zeros((height, width), dtype=bool)
    interior[EDGE_MARGIN_PX : height - EDGE_MARGIN_PX, EDGE_MARGIN_PX : width - EDGE_MARGIN_PX] = True
    n_trials = len(axis) ** 2 * int(interior.sum())

    window_years = (max(mjds) - min(mjds)) / 365.25
    min_speed = MIN_DISPLACEMENT_PX * pixel_scale_arcsec / window_years if window_years > 0 else np.inf
    limitations.append(
        f"Velocities below {min_speed:.1f} arcsec/yr (less than {MIN_DISPLACEMENT_PX} px over the "
        "window) are not searched: they cannot be told apart from static residuals."
    )
    significance = np.full((len(axis), len(axis)), np.nan)
    best: dict[str, Any] = {"sigma": -np.inf}
    for iy, v_north in enumerate(axis):
        for ix, v_east in enumerate(axis):
            if np.hypot(v_east, v_north) < min_speed:
                continue
            shifts = motion_shifts(
                mjds, v_east * 1000.0, v_north * 1000.0, ref_mjd, pixel_scale_arcsec
            )
            mean, error = stack_weighted(images, variances, shifts)
            sig_map = matched_filter_significance(mean, error, psf_sigma_pix)
            masked = np.where(interior, sig_map, -np.inf)
            peak_index = np.unravel_index(np.nanargmax(masked), masked.shape)
            peak = float(masked[peak_index])
            significance[iy, ix] = peak
            if peak > best["sigma"]:
                best = {"sigma": peak, "v_east": float(v_east), "v_north": float(v_north),
                        "x": int(peak_index[1]), "y": int(peak_index[0]), "mean": mean, "error": error}
    if "v_east" not in best:
        limitations.append("No searchable velocity or no covered pixels: nothing to report.")
        return {"ok": False, "n_visits": len(images), "limitations": limitations}
    edge = float(np.max(axis)) - 1e-9
    at_edge = abs(best["v_east"]) >= edge or abs(best["v_north"]) >= edge
    if at_edge:
        limitations.append(
            "The best velocity lies at the edge of the searched range; widen the range before "
            "trusting it."
        )
    sigma_corrected, p_value = corrected_sigma(best["sigma"], n_trials)
    result = {
        "ok": True,
        "n_visits": len(images),
        "velocity_axis_arcsec_yr": [float(v) for v in axis],
        "significance_map": [[None if not np.isfinite(v) else float(v) for v in row] for row in significance],
        "best": {
            "v_east_arcsec_yr": best["v_east"],
            "v_north_arcsec_yr": best["v_north"],
            "x": best["x"],
            "y": best["y"],
            "sigma_raw": float(best["sigma"]),
            "sigma_corrected": sigma_corrected,
            "p_value_corrected": p_value,
            "n_trials": n_trials,
            "at_grid_edge": at_edge,
            "detected": bool(sigma_corrected >= threshold_sigma and not at_edge),
        },
        "threshold_sigma": threshold_sigma,
        "limitations": limitations,
    }
    return {**result, "_stack_mean": best["mean"], "_stack_error": best["error"]}
