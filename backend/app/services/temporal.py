"""Temporal analysis engine: aligned comparison of two compatible cutouts.

Pipeline: load -> mask -> background match -> WCS reproject -> difference
with propagated variance -> source detection (photutils) -> astrometry at the
target position -> angular displacement with uncertainty.

Every finding is a *possible candidate* with SNR, uncertainty and limitations.
"""

import io
from typing import Any

import numpy as np

from app.logging import get_logger
from app.config import get_settings
from app.services.fits_processing import FITSProcessingService
from app.services.jobs import UserFacingError
from app.services.spherex_product import hard_mask_valid

log = get_logger("temporal")

ARCSEC_PER_DEG = 3600.0
RAYLEIGH_3_SIGMA = 3.44
CENTROID_INFLATION = 6.0


class IncompatibleError(UserFacingError, ValueError):
    pass


class TemporalAnalysisEngine:
    def __init__(self) -> None:
        self.fits = FITSProcessingService()

    def compare(
        self,
        data_a: bytes,
        data_b: bytes,
        meta_a: dict[str, Any],
        meta_b: dict[str, Any],
        ra_deg: float | None = None,
        dec_deg: float | None = None,
        detection_sigma: float = 5.0,
        min_pixels: int | None = None,
        match_psf: bool = True,
        render_images: bool = True,
    ) -> dict[str, Any]:
        limitations: list[str] = []
        a = self.fits.load_science_arrays(data_a)
        b = self.fits.load_science_arrays(data_b)

        det_a = self._detector(a, meta_a)
        det_b = self._detector(b, meta_b)
        if det_a is None or det_b is None:
            raise IncompatibleError(
                "Both cutouts need a known detector; SPHEREx detectors cannot be compared blindly."
            )
        if det_a != det_b:
            raise IncompatibleError(
                f"Different detectors (D{det_a} vs D{det_b}); SPHEREx detectors "
                "cannot be mixed without dedicated calibration."
            )
        band_a = str(meta_a.get("band", ""))
        band_b = str(meta_b.get("band", ""))
        if band_a and band_b and band_a != band_b:
            limitations.append(
                f"Spectral products differ ({band_a} vs {band_b}); variability "
                "claims require compatible spectral response."
            )

        img_a, mask_a = self._masked(a)
        img_b, mask_b = self._masked(b)
        if match_psf:
            img_a, mask_a, img_b, mask_b = self._match_psf(
                a, b, img_a, mask_a, img_b, mask_b, limitations
            )
        bg_a = float(np.median(img_a[mask_a])) if mask_a.any() else 0.0
        bg_b = float(np.median(img_b[mask_b])) if mask_b.any() else 0.0
        img_b_matched = img_b - (bg_b - bg_a)

        aligned_b, footprint, aligned = self._align(
            a["wcs"], b["wcs"], img_a.shape, img_b_matched, mask_b, limitations
        )

        if aligned_b.shape != img_a.shape:
            raise IncompatibleError(
                f"Incompatible grids after alignment: {img_a.shape} vs {aligned_b.shape}."
            )
        valid = mask_a & np.isfinite(aligned_b) & (footprint > 0)
        difference = np.full_like(img_a, np.nan)
        difference[valid] = img_a[valid] - aligned_b[valid]

        var_a = a["variance"]
        var_b = b["variance"]
        aligned_var_b_full = None
        diff_sigma = np.full_like(img_a, np.nan)
        if (
            var_a is not None
            and var_b is not None
            and var_b.shape == img_b.shape
        ):
            aligned_var_b, _, _ = self._align(
                a["wcs"], b["wcs"], img_a.shape, np.nan_to_num(var_b), mask_b, []
            )
            aligned_var_b_full = aligned_var_b
            combined = np.full_like(img_a, np.nan)
            combined[valid] = var_a[valid] + np.abs(aligned_var_b[valid])
            diff_sigma[valid] = np.sqrt(np.maximum(combined[valid], 0))
        else:
            limitations.append("Variance planes missing; difference noise estimated from pixels.")
            noise = float(np.nanstd(difference[valid])) if valid.any() else float("nan")
            diff_sigma[valid] = noise

        scale = self._pixel_scale_arcsec(a["wcs"]) if a["wcs"] is not None else None
        detections = self._detect(
            difference, diff_sigma, detection_sigma, limitations, a["wcs"],
            min_pixels if min_pixels is not None else get_settings().detection_min_pixels,
        )
        psf_sigma = self._psf_sigma_pix(a["header"], scale)
        astrometry = self._astrometry(
            img_a, mask_a, var_a, aligned_b, footprint, aligned_var_b_full,
            a["wcs"], ra_deg, dec_deg, psf_sigma, detection_sigma, limitations,
        )
        result: dict[str, Any] = {
            "data_class": "COMPUTED_MEASUREMENT",
            "aligned": aligned,
            "grid_shape": list(img_a.shape),
            "background_mjy_sr": {"a": bg_a, "b": bg_b, "matched_offset": bg_b - bg_a},
            "valid_fraction": float(valid.mean()),
            "difference_stats": self._stats(difference[valid]),
            "detections": detections,
            "astrometry": astrometry,
            "limitations": limitations,
            "inputs": {
                "a": {k: meta_a.get(k) for k in ("obs_id", "collection", "detector", "band", "date_obs")},
                "b": {k: meta_b.get(k) for k in ("obs_id", "collection", "detector", "band", "date_obs")},
            },
        }
        if render_images:
            result["images"] = {
                "a_png": self._png(img_a),
                "b_png": self._png(aligned_b),
                "diff_png": self._png(difference, diverging=True),
            }
        return result

    @staticmethod
    def _masked(bundle: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
        image = np.asarray(bundle["image"], dtype=np.float64)
        mask = np.isfinite(image)
        flags = bundle.get("flags")
        if flags is not None:
            mask &= hard_mask_valid(flags)
        return image, mask

    @staticmethod
    def _align(wcs_a, wcs_b, shape_a, image_b, mask_b, limitations: list) -> tuple[np.ndarray, np.ndarray, bool]:
        """Reproject B onto A's grid using each epoch's own WCS.

        Falls back to a native-grid compare with a recorded warning (the
        result is then display-grade, never astrometric).
        """
        try:
            from reproject import reproject_interp  # type: ignore[import-untyped]

            if wcs_a is None or wcs_b is None:
                raise ValueError("no celestial WCS in one or both epochs")
            filled = np.where(mask_b, image_b, np.nan)
            aligned, footprint = reproject_interp((filled, wcs_b), wcs_a, shape_out=shape_a)
            return np.asarray(aligned, dtype=np.float64), np.asarray(footprint), True
        except Exception as exc:  # noqa: BLE001 - honest fallback, recorded
            limitations.append(
                "WCS reprojection unavailable "
                f"({exc}); compared on native grids. Shifts are NOT astrometric."
            )
            footprint = np.ones_like(image_b, dtype=np.float64)
            footprint[~mask_b] = 0.0
            return np.asarray(image_b, dtype=np.float64), footprint, False

    @staticmethod
    def _stats(values: np.ndarray) -> dict[str, Any]:
        values = values[np.isfinite(values)]
        if values.size == 0:
            return {"n": 0}
        return {
            "n": int(values.size),
            "median": float(np.median(values)),
            "std": float(np.std(values)),
            "min": float(np.min(values)),
            "max": float(np.max(values)),
        }

    @staticmethod
    def _png(image: np.ndarray, diverging: bool = False) -> str:
        import base64

        from PIL import Image  # type: ignore[import-untyped]

        valid = np.isfinite(image)
        finite = image[valid]
        if finite.size == 0:
            canvas = Image.new("L", (64, 64))
        else:
            if diverging:
                scale = float(np.nanpercentile(np.abs(finite), 99)) or 1.0
                norm = np.clip(np.nan_to_num(image / scale), -1, 1)
                rgb = np.zeros((*image.shape, 3), dtype=np.uint8)
                pos = np.clip(norm, 0, 1)
                neg = np.clip(-norm, 0, 1)
                rgb[..., 0] = (pos * 255).astype(np.uint8)
                rgb[..., 2] = (neg * 255).astype(np.uint8)
                rgb[..., 1] = (np.abs(norm) * 60).astype(np.uint8)
                for channel in range(3):
                    rgb[..., channel][~valid] = 0
                canvas = Image.fromarray(rgb)
            else:
                lo, hi = np.percentile(finite, (1, 99))
                if hi <= lo:
                    hi = lo + 1.0
                norm = np.clip((np.nan_to_num(image) - lo) / (hi - lo), 0, 1)
                norm[~valid] = 0.0
                canvas = Image.fromarray((norm * 255).astype(np.uint8))
        canvas.thumbnail((512, 512))
        buffer = io.BytesIO()
        canvas.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode()

    @staticmethod
    def _match_psf(a, b, img_a, mask_a, img_b, mask_b, limitations):
        """Smooth the sharper epoch with a Gaussian so both share the broader PSF width."""
        from scipy.ndimage import gaussian_filter  # type: ignore[import-untyped]

        fwhm_a, fwhm_b = a["header"].get("PSF_FWHM"), b["header"].get("PSF_FWHM")
        if not fwhm_a or not fwhm_b:
            limitations.append("PSF width unknown for one epoch; PSFs were not matched.")
            return img_a, mask_a, img_b, mask_b
        scale = (
            TemporalAnalysisEngine._pixel_scale_arcsec(a["wcs"]) if a["wcs"] is not None else None
        ) or 6.15
        sigma_a, sigma_b = float(fwhm_a) / scale / 2.355, float(fwhm_b) / scale / 2.355
        if abs(sigma_a - sigma_b) < 0.03:
            return img_a, mask_a, img_b, mask_b
        kernel = float(np.sqrt(abs(sigma_a**2 - sigma_b**2)))
        sharper = a if sigma_a < sigma_b else b
        image, mask = (img_a, mask_a) if sharper is a else (img_b, mask_b)
        weight = gaussian_filter(mask.astype(float), kernel)
        smoothed = gaussian_filter(np.where(mask, image, 0.0), kernel)
        new_mask = mask & (weight > 0.5)
        new_image = np.where(new_mask, smoothed / np.where(weight > 0, weight, 1.0), np.nan)
        if sharper["variance"] is not None:
            impulse = np.zeros((41, 41))
            impulse[20, 20] = 1.0
            noise_gain = float((gaussian_filter(impulse, kernel) ** 2).sum())
            var = gaussian_filter(np.where(mask, sharper["variance"], 0.0), kernel)
            sharper["variance"] = np.where(
                new_mask, var / np.where(weight > 0, weight, 1.0) * noise_gain, np.nan
            )
        limitations.append(
            f"PSFs matched by smoothing the sharper epoch with a Gaussian of {kernel:.2f} px sigma "
            "(Gaussian approximation of the PSF)."
        )
        if sharper is a:
            return new_image, new_mask, img_b, mask_b
        return img_a, mask_a, new_image, new_mask

    @staticmethod
    def _detector(bundle: dict[str, Any], meta: dict[str, Any]) -> int | None:
        product = bundle.get("product")
        value = product.detector if product is not None else None
        if value is None:
            try:
                value = int(meta.get("detector"))
            except (TypeError, ValueError):
                value = None
        return value

    @staticmethod
    def _psf_sigma_pix(header: dict[str, Any], scale_arcsec: float | None) -> float:
        fwhm_arcsec = header.get("PSF_FWHM")
        scale = scale_arcsec or 6.15
        fwhm_pix = float(fwhm_arcsec) / scale if fwhm_arcsec else 1.1
        return max(fwhm_pix, 0.8) / 2.355

    def _detect(
        self,
        difference: np.ndarray,
        sigma: np.ndarray,
        threshold_sigma: float,
        limitations: list[str],
        wcs,
        min_pixels: int,
    ) -> list[dict[str, Any]]:
        try:
            from photutils.segmentation import detect_sources  # type: ignore[import-untyped]
        except ImportError:
            limitations.append("photutils unavailable; detection skipped.")
            return []
        snr = np.full_like(difference, np.nan)
        ok = np.isfinite(difference) & np.isfinite(sigma) & (sigma > 0)
        snr[ok] = difference[ok] / sigma[ok]
        detections: list[dict[str, Any]] = []
        for direction, signed in (("decrease", snr), ("increase", -snr)):
            try:
                segments = detect_sources(
                    np.nan_to_num(signed, nan=0.0), threshold=threshold_sigma, npixels=min_pixels
                )
            except Exception as exc:  # noqa: BLE001
                limitations.append(f"Source detection failed: {exc}")
                continue
            if segments is None or segments.nlabels == 0:
                continue
            for label in range(1, segments.nlabels + 1):
                pixels = segments.data == label
                ys, xs = np.nonzero(pixels)
                weights = np.clip(signed[pixels], 0, None)
                x_c = float(np.average(xs, weights=weights))
                y_c = float(np.average(ys, weights=weights))
                ra = dec = None
                if wcs is not None:
                    world = wcs.all_pix2world([[x_c, y_c]], 0)[0]
                    ra, dec = float(world[0]), float(world[1])
                detections.append(
                    {
                        "label": label,
                        "direction": direction,
                        "npixels": int(pixels.sum()),
                        "peak_snr": float(np.nanmax(signed[pixels])),
                        "x_centroid": x_c,
                        "y_centroid": y_c,
                        "ra_deg": ra,
                        "dec_deg": dec,
                        "classification": "possible candidate (unclassified)",
                    }
                )
        if wcs is None:
            limitations.append("No celestial WCS: detections carry no sky coordinates.")
        detections.sort(key=lambda d: d["peak_snr"], reverse=True)
        return detections[:50]

    @staticmethod
    def _find_source(
        image, mask, variance, x0, y0, psf_sigma, half, threshold
    ) -> tuple[float, float, float] | None:
        from scipy.ndimage import gaussian_filter  # type: ignore[import-untyped]

        valid = mask & np.isfinite(image)
        if valid.sum() < 20:
            return None
        background = np.median(image[valid])
        data = np.where(valid, image - background, 0.0)
        if variance is not None and np.isfinite(variance[valid]).any():
            noise = float(np.sqrt(np.nanmedian(variance[valid])))
        else:
            noise = float(1.4826 * np.median(np.abs(data[valid])))
        if not noise or not np.isfinite(noise):
            return None
        kernel_norm = 1.0 / (2.0 * np.sqrt(np.pi) * psf_sigma)
        matched = gaussian_filter(data, psf_sigma, mode="constant")
        snr_map = matched / (noise * kernel_norm)
        yy, xx = np.mgrid[0 : image.shape[0], 0 : image.shape[1]]
        window = ((xx - x0) ** 2 + (yy - y0) ** 2 <= half**2) & valid
        if not window.any():
            return None
        peak_index = np.unravel_index(np.argmax(np.where(window, snr_map, -np.inf)), snr_map.shape)
        peak_snr = float(snr_map[peak_index])
        if peak_snr < threshold:
            return None
        py, px = peak_index
        local = ((xx - px) ** 2 + (yy - py) ** 2 <= 2.5**2) & valid
        weights = np.clip(data, 0, None) * local
        if weights.sum() <= 0:
            return None
        cx = float((xx * weights).sum() / weights.sum())
        cy = float((yy * weights).sum() / weights.sum())
        total = weights.sum()
        var_x = float((weights**2 * (xx - cx) ** 2).sum() * noise**2 / total**2)
        var_y = float((weights**2 * (yy - cy) ** 2).sum() * noise**2 / total**2)
        sigma_axis = float(np.sqrt((var_x + var_y) / 2.0))
        return cx, cy, peak_snr, max(sigma_axis, psf_sigma / peak_snr) * (1.0 + CENTROID_INFLATION / peak_snr)

    def _astrometry(
        self,
        img_a,
        mask_a,
        var_a,
        aligned_b,
        footprint,
        var_b,
        wcs,
        ra_deg,
        dec_deg,
        psf_sigma,
        threshold,
        limitations: list[str],
    ) -> dict[str, Any]:
        out: dict[str, Any] = {"measured": False}
        if ra_deg is None or dec_deg is None:
            limitations.append("No target coordinates supplied; displacement not measured.")
            return out
        if wcs is None:
            limitations.append("Astrometry unavailable: no celestial WCS.")
            return out
        try:
            x, y = wcs.all_world2pix([[ra_deg, dec_deg]], 0)[0]
            half = 6.0
            mask_b = (footprint > 0) & np.isfinite(aligned_b)
            found_a = self._find_source(img_a, mask_a, var_a, x, y, psf_sigma, half, threshold)
            found_b = self._find_source(aligned_b, mask_b, var_b, x, y, psf_sigma, half, threshold)
            if found_a is None or found_b is None:
                limitations.append(
                    "No source above the detection threshold near the target in both epochs; "
                    "displacement not measured."
                )
                return out
            world_a = wcs.all_pix2world([[found_a[0], found_a[1]]], 0)[0]
            world_b = wcs.all_pix2world([[found_b[0], found_b[1]]], 0)[0]
            d_ra = ((world_a[0] - world_b[0] + 180.0) % 360.0) - 180.0
            sep_deg = float(
                np.sqrt((d_ra * np.cos(np.deg2rad(world_a[1]))) ** 2 + (world_a[1] - world_b[1]) ** 2)
            )
            scale = self._pixel_scale_arcsec(wcs) or 6.15
            sigma_pix = float(
                np.sqrt(found_a[3] ** 2 + found_b[3] ** 2 + get_settings().alignment_error_pix**2)
            )
            separation = sep_deg * ARCSEC_PER_DEG
            error = sigma_pix * scale
            out = {
                "measured": True,
                "ra_a_deg": float(world_a[0]),
                "dec_a_deg": float(world_a[1]),
                "ra_b_deg": float(world_b[0]),
                "dec_b_deg": float(world_b[1]),
                "separation_arcsec": separation,
                "separation_err_arcsec": error,
                "snr_a": found_a[2],
                "snr_b": found_b[2],
                "significant": bool(separation > RAYLEIGH_3_SIGMA * error),
                "note": "Apparent shift on the celestial sphere; not a 3D motion.",
            }
        except Exception as exc:  # noqa: BLE001
            limitations.append(f"Astrometry unavailable: {exc}")
        return out

    @staticmethod
    def _centroid(window: np.ndarray, mask: np.ndarray) -> tuple[float, float] | None:
        values = np.where(mask, window, np.nan)
        if not np.isfinite(values).any():
            return None
        bg = np.nanmedian(values)
        weights = np.clip(values - bg, 0, None)
        if weights.sum() <= 0 or not np.isfinite(weights).any():
            return None
        yy, xx = np.mgrid[0 : window.shape[0], 0 : window.shape[1]]
        return float((xx * weights).sum() / weights.sum()), float(
            (yy * weights).sum() / weights.sum()
        )

    @staticmethod
    def _pixel_scale_arcsec(wcs) -> float | None:
        try:
            from astropy.wcs.utils import proj_plane_pixel_scales  # type: ignore[import-untyped]

            return float(proj_plane_pixel_scales(wcs.celestial)[0] * ARCSEC_PER_DEG)
        except Exception:  # noqa: BLE001
            return None
