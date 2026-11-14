"""Aperture photometry on native SPHEREx pixels and relative light curves.

When the product carries an ePSF table (pipeline v7+, DR1) the flux is divided by the encircled
energy of the nearest detector zone's ePSF inside the aperture, so the light lost outside the
aperture is corrected epoch by epoch; the stamp spans about +-3.2 native pixels, so this is the
flux within that stamp, not a total flux. Older products are left uncorrected. Pixels carrying any
unusable-pixel flag inside the aperture mark the point as flagged and exclude it from fits.
"""

from typing import Any

import numpy as np

PIXEL_SCALE_ARCSEC = 6.15
WING_MIN_SNR = 5.0
WING_RAW_SNR = 8.0
PIXEL_SOLID_ANGLE_SR = (PIXEL_SCALE_ARCSEC * np.pi / 648000.0) ** 2


def aperture_radius_pix(product) -> float:
    fwhm = product.header.get("PSF_FWHM")
    fwhm_pix = float(fwhm) / PIXEL_SCALE_ARCSEC if fwhm else 1.1
    return max(1.5, 1.4 * fwhm_pix)


def epsf_encircled_energy(product, x: float, y: float, radius_pix: float) -> dict[str, Any] | None:
    """Encircled energy within `radius_pix` of the ePSF zone nearest to cutout pixel (x, y)."""
    epsf = getattr(product, "epsf", None)
    crpix1a, crpix2a = product.header.get("CRPIX1A"), product.header.get("CRPIX2A")
    if epsf is None or crpix1a is None or crpix2a is None:
        return None
    # Cutout -> parent image, as in IRSA's spherex-psf notebook.
    x_parent = 1.0 + x - float(crpix1a)
    y_parent = 1.0 + y - float(crpix2a)
    zone = int(np.argmin(np.hypot(epsf["xcenter"] - x_parent, epsf["ycenter"] - y_parent)))
    stamp = epsf["stamps"][zone]
    total = float(np.nansum(stamp))
    if not np.isfinite(total) or total <= 0:
        return None
    centre_y, centre_x = (np.asarray(stamp.shape) - 1) / 2.0
    yy, xx = np.mgrid[: stamp.shape[0], : stamp.shape[1]]
    inside = np.hypot(xx - centre_x, yy - centre_y) / epsf["oversample"] <= radius_pix
    energy = float(np.nansum(stamp[inside]) / total)
    if not 0 < energy <= 1:
        return None
    return {"zone": [int(epsf["binx"][zone]), int(epsf["biny"][zone])], "encircled_energy": energy}


def aperture_photometry(
    product, ra_deg: float, dec_deg: float, radius_pix: float | None = None,
    annulus: tuple[float, float] = (4.0, 7.0),
) -> dict[str, Any]:
    from photutils.aperture import CircularAperture  # type: ignore[import-untyped]

    try:
        x, y = product.pixel_of(ra_deg, dec_deg)
    except ValueError:
        return {"ok": False, "reason": "no celestial WCS"}
    image = product.science_image
    height, width = image.shape
    radius = radius_pix or aperture_radius_pix(product)
    if not (0 <= x < width and 0 <= y < height):
        return {"ok": False, "reason": "outside the cutout", "x": x, "y": y}
    valid = product.quality_mask
    yy, xx = np.mgrid[:height, :width]
    r2 = (xx - x) ** 2 + (yy - y) ** 2
    ring = valid & (r2 >= annulus[0] ** 2) & (r2 <= annulus[1] ** 2)
    if ring.sum() < 10:
        return {"ok": False, "reason": "background annulus has too few valid pixels", "x": x, "y": y}
    ring_values = image[ring]
    clipped = ring_values[np.abs(ring_values - np.median(ring_values)) < 3 * 1.4826 * np.median(np.abs(ring_values - np.median(ring_values))) + 1e-12]
    background = float(np.median(clipped)) if clipped.size else float(np.median(ring_values))
    background_sigma = float(np.std(clipped)) if clipped.size > 1 else 0.0
    aperture = CircularAperture((x, y), r=radius)
    data = np.where(valid, image - background, 0.0)
    if product.variance is not None:
        error = np.sqrt(np.where(valid, product.variance, 0.0))
    else:
        error = np.full_like(data, background_sigma)
    total, total_error = aperture.do_photometry(data, error=error, method="exact")
    in_aperture = r2 <= (radius + 0.5) ** 2
    flagged = bool((~valid[in_aperture]).any())
    n_pix = float(np.pi * radius**2)
    bg_error = background_sigma / np.sqrt(max(clipped.size, 1)) * n_pix
    flux_raw = float(total[0])
    flux_err_raw = float(np.sqrt(total_error[0] ** 2 + bg_error**2))
    psf = epsf_encircled_energy(product, x, y, radius)
    correction = 1.0 / psf["encircled_energy"] if psf else 1.0
    flux = flux_raw * correction
    flux_err = flux_err_raw * correction
    return {
        "ok": True,
        "x": float(x),
        "y": float(y),
        "flux": flux,
        "flux_err": flux_err,
        "flux_jy": flux * PIXEL_SOLID_ANGLE_SR * 1e6,
        "flux_jy_err": flux_err * PIXEL_SOLID_ANGLE_SR * 1e6,
        "background": background,
        "flagged": flagged,
        "radius_pix": float(radius),
        "snr": flux / flux_err if flux_err > 0 else None,
        "flux_uncorrected": flux_raw,
        "flux_err_uncorrected": flux_err_raw,
        "psf_model": "epsf" if psf else "none",
        "psf_zone": psf["zone"] if psf else None,
        "encircled_energy": psf["encircled_energy"] if psf else None,
        "aperture_correction": correction,
    }


def select_comparisons(
    candidates: list[dict[str, Any]], target_flux: float | None, n_max: int = 10, n_min: int = 3,
) -> list[dict[str, Any]]:
    """Pick well-measured, unflagged comparison stars with flux closest to the target's."""
    good = [
        c for c in candidates
        if c.get("ok") and not c.get("flagged") and (c.get("snr") or 0) >= 10 and c["flux"] > 0
    ]
    if target_flux and target_flux > 0:
        good.sort(key=lambda c: abs(np.log(c["flux"] / target_flux)))
    else:
        good.sort(key=lambda c: -c["flux"])
    return good[:n_max] if len(good) >= n_min else []


def _rel_error(value: float, numerator_err: float, numerator: float, denominator_err: float, denominator: float):
    if not numerator or not denominator:
        return None
    return abs(value) * float(np.hypot(numerator_err / numerator, denominator_err / denominator))


def relative_lightcurve(
    mjds: list[float],
    target: list[dict[str, Any]],
    comparisons: list[list[dict[str, Any]]],
) -> dict[str, Any]:
    """target[i] / ensemble median of comparisons at epoch i, normalised to the median of the curve."""
    count = len(target)
    scale: list[float | None] = []
    for comp in comparisons:
        good = [c["flux"] for c in comp if c.get("ok") and not c.get("flagged") and c["flux"] > 0]
        scale.append(float(np.median(good)) if good else None)
    ensemble, ensemble_err = [], []
    for i in range(count):
        fluxes, errors = [], []
        for comp, norm_factor in zip(comparisons, scale):
            c = comp[i]
            if norm_factor and c.get("ok") and not c.get("flagged"):
                fluxes.append(c["flux"] / norm_factor)
                errors.append(c["flux_err"] / norm_factor)
        ensemble.append(float(np.median(fluxes)) if fluxes else None)
        ensemble_err.append(float(np.median(errors) / np.sqrt(len(errors))) if errors else None)

    use_comparisons = any(e is not None for e in ensemble)
    points = []
    for i in range(count):
        t = target[i]
        usable = bool(t.get("ok")) and not t.get("flagged")
        if use_comparisons:
            usable = usable and ensemble[i] is not None and ensemble[i] > 0
            value = t["flux"] / ensemble[i] if usable else None
            err = _rel_error(value, t["flux_err"], t["flux"], ensemble_err[i], ensemble[i]) if usable else None
        else:
            value = t["flux"] if usable else None
            err = t["flux_err"] if usable else None
        points.append({"index": i, "mjd": mjds[i], "value": value, "err": err,
                       "flagged": bool(t.get("flagged")) or not t.get("ok"), "used": value is not None})
    values = [p["value"] for p in points if p["used"]]
    norm = float(np.median(values)) if values else 1.0
    if not norm:
        norm = 1.0
    for p in points:
        if p["used"]:
            p["value"] /= norm
            p["err"] = p["err"] / abs(norm) if p["err"] is not None else None

    scatter = None
    if use_comparisons and len(comparisons) >= 2:
        per_star = []
        for comp, norm_factor in zip(comparisons, scale):
            ratios = [
                (comp[i]["flux"] / norm_factor) / ensemble[i]
                for i in range(count)
                if norm_factor and ensemble[i] and comp[i].get("ok") and not comp[i].get("flagged")
            ]
            if len(ratios) >= 3 and np.median(ratios):
                per_star.append(float(np.std(ratios) / np.median(ratios)))
        scatter = float(np.median(per_star)) if per_star else None
    return {
        "relative": use_comparisons,
        "label": "relative to comparison stars" if use_comparisons
        else "absolute flux (no valid comparison stars): not corrected for common changes",
        "points": points,
        "comparison_scatter": scatter,
        "n_comparisons": len(comparisons) if use_comparisons else 0,
    }


def wing_amplitudes(
    products: list[Any],
    positions: list[tuple[float, float]],
    r_in: float = 5.0,
    r_out: float = 13.0,
    min_pixels: int = 4,
) -> list[dict[str, Any]]:
    """Relative amplitude of the PSF wings per frame, for a target whose core saturates.

    Each frame's azimuthally averaged profile is fitted with a template shared by all frames, using
    only unflagged pixels, so changing masks do not change the amplitude. Relative values only.
    """
    n_bins = int(r_out - r_in)
    profiles = np.full((len(products), n_bins), np.nan)
    counts = np.zeros((len(products), n_bins))
    ok = np.zeros(len(products), dtype=bool)
    raw_snr = np.zeros(len(products))
    for i, (product, (ra, dec)) in enumerate(zip(products, positions)):
        try:
            x, y = product.pixel_of(ra, dec)
        except ValueError:
            continue
        image = product.science_image
        height, width = image.shape
        yy, xx = np.mgrid[:height, :width]
        radius = np.hypot(xx - x, yy - y)
        valid = product.quality_mask
        sky = valid & (radius >= r_out + 3) & (radius < r_out + 9)
        if sky.sum() < 20:
            continue
        background = float(np.median(image[sky]))
        for k in range(n_bins):
            ring = valid & (radius >= r_in + k) & (radius < r_in + k + 1)
            counts[i, k] = ring.sum()
            if counts[i, k] >= min_pixels:
                profiles[i, k] = float(np.mean(image[ring] - background))
        ok[i] = bool((counts[i] >= min_pixels).sum() >= max(3, n_bins // 2))
        sky_sigma = float(np.std(image[sky]))
        used = counts[i] >= min_pixels
        if sky_sigma > 0 and used.any():
            mean_signal = float(np.nanmean(profiles[i][used]))
            raw_snr[i] = mean_signal * float(np.sqrt(counts[i][used].sum())) / sky_sigma
        ok[i] = ok[i] and raw_snr[i] >= WING_RAW_SNR
    if ok.sum() < 3:
        return [{"ok": False, "flagged": True, "flux": 0.0, "flux_err": 0.0} for _ in products]

    amplitude = np.where(ok, np.nanmean(np.where(counts >= min_pixels, profiles, np.nan), axis=1), np.nan)
    template = np.zeros(n_bins)
    for _ in range(3):
        normalised = profiles / amplitude[:, None]
        template = np.nanmedian(normalised[ok], axis=0)
        template = np.where(np.isfinite(template), template, 0.0)
        for i in np.where(ok)[0]:
            use = (counts[i] >= min_pixels) & np.isfinite(profiles[i]) & (template != 0)
            if use.sum() < 3:
                ok[i] = False
                continue
            w = counts[i][use]
            amplitude[i] = float((w * profiles[i][use] * template[use]).sum() / (w * template[use] ** 2).sum())
    results = []
    for i in range(len(products)):
        if not ok[i] or not np.isfinite(amplitude[i]) or amplitude[i] <= 0:
            results.append({"ok": False, "flagged": True, "flux": 0.0, "flux_err": 0.0})
            continue
        use = (counts[i] >= min_pixels) & np.isfinite(profiles[i]) & (template != 0)
        w = counts[i][use]
        residual = profiles[i][use] - amplitude[i] * template[use]
        dof = max(use.sum() - 1, 1)
        scatter = float(np.sqrt((w * residual**2).sum() / dof / w.sum()))
        error = scatter / float(np.sqrt((w * template[use] ** 2).sum()) / np.sqrt(w.sum()))
        flux_err = float(error / np.sqrt(w.sum())) if error else float(0.02 * amplitude[i])
        snr = float(amplitude[i] / flux_err) if flux_err else None
        if snr is None or snr < WING_MIN_SNR:
            results.append({"ok": False, "flagged": True, "flux": 0.0, "flux_err": 0.0})
            continue
        results.append({"ok": True, "flagged": False, "flux": float(amplitude[i]),
                        "flux_err": flux_err, "snr": snr})
    return results
