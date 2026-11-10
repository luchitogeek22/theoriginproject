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
from app.services.fits_processing import FITSProcessingService

log = get_logger("temporal")

ARCSEC_PER_DEG = 3600.0


class IncompatibleError(ValueError):
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
    ) -> dict[str, Any]:
        limitations: list[str] = []
        a = self.fits.load_science_arrays(data_a)
        b = self.fits.load_science_arrays(data_b)

        det_a = str(meta_a.get("detector", ""))
        det_b = str(meta_b.get("detector", ""))
        if det_a and det_b and det_a != det_b:
            raise IncompatibleError(
                f"Different detectors ({det_a} vs {det_b}); SPHEREx detectors "
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
        bg_a = float(np.median(img_a[mask_a])) if mask_a.any() else 0.0
        bg_b = float(np.median(img_b[mask_b])) if mask_b.any() else 0.0
        img_b_matched = img_b - (bg_b - bg_a)

        aligned_b, footprint, aligned = self._align(
            a["header"], b["header"], img_b_matched, mask_b, limitations
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
        diff_sigma = np.full_like(img_a, np.nan)
        if (
            var_a is not None
            and var_b is not None
            and var_b.shape == img_b.shape
        ):
            aligned_var_b, _, _ = self._align(
                a["header"], b["header"], np.nan_to_num(var_b), mask_b, []
            )
            combined = np.full_like(img_a, np.nan)
            combined[valid] = var_a[valid] + np.abs(aligned_var_b[valid])
            diff_sigma[valid] = np.sqrt(np.maximum(combined[valid], 0))
        else:
            limitations.append("Variance planes missing; difference noise estimated from pixels.")
            noise = float(np.nanstd(difference[valid])) if valid.any() else float("nan")
            diff_sigma[valid] = noise

        detections = self._detect(difference, diff_sigma, detection_sigma, limitations)
        astrometry = self._astrometry(
            img_a, mask_a, aligned_b, footprint, a["header"], ra_deg, dec_deg, limitations
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
            mask &= np.asarray(flags) == 0
        return image, mask

    @staticmethod
    def _align(header_a, header_b, image_b, mask_b, limitations: list) -> tuple[np.ndarray, np.ndarray, bool]:
        """Reproject B onto A's grid using each epoch's own WCS.

        Falls back to a native-grid compare with a recorded warning (the
        result is then display-grade, never astrometric).
        """
        try:
            from astropy.wcs import WCS  # type: ignore[import-untyped]
            from reproject import reproject_interp  # type: ignore[import-untyped]

            wcs_a = WCS(dict(header_a))
            wcs_b = WCS(dict(header_b))
            if not wcs_a.has_celestial or not wcs_b.has_celestial:
                raise ValueError("no celestial WCS in one or both epochs")
            nx = int(header_a.get("NAXIS1", image_b.shape[1]))
            ny = int(header_a.get("NAXIS2", image_b.shape[0]))
            filled = np.where(mask_b, image_b, np.nan)
            aligned, footprint = reproject_interp((filled, wcs_b), wcs_a, shape_out=(ny, nx))
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

    def _detect(
        self,
        difference: np.ndarray,
        sigma: np.ndarray,
        threshold_sigma: float,
        limitations: list[str],
    ) -> list[dict[str, Any]]:
        try:
            from photutils.segmentation import detect_sources  # type: ignore[import-untyped]
        except ImportError:
            limitations.append("photutils unavailable; detection skipped.")
            return []
        snr = np.full_like(difference, np.nan)
        ok = np.isfinite(difference) & np.isfinite(sigma) & (sigma > 0)
        snr[ok] = difference[ok] / sigma[ok]
        try:
            segments = detect_sources(snr, threshold=threshold_sigma, npixels=5)
        except Exception as exc:  # noqa: BLE001
            limitations.append(f"Source detection failed: {exc}")
            return []
        if segments is None or segments.nlabels == 0:
            return []
        detections = []
        for label in range(1, segments.nlabels + 1):
            pixels = segments.data == label
            peak = float(np.nanmax(np.abs(snr[pixels])))
            ys, xs = np.nonzero(pixels)
            detections.append(
                {
                    "label": label,
                    "npixels": int(pixels.sum()),
                    "peak_snr": peak,
                    "x_centroid": float(xs.mean()),
                    "y_centroid": float(ys.mean()),
                    "classification": "possible candidate (unclassified)",
                }
            )
        detections.sort(key=lambda d: d["peak_snr"], reverse=True)
        return detections[:50]

    def _astrometry(
        self,
        img_a,
        mask_a,
        aligned_b,
        footprint,
        header_a,
        ra_deg,
        dec_deg,
        limitations: list[str],
    ) -> dict[str, Any]:
        out: dict[str, Any] = {"measured": False}
        if ra_deg is None or dec_deg is None:
            limitations.append("No target coordinates supplied; displacement not measured.")
            return out
        try:
            from astropy.wcs import WCS  # type: ignore[import-untyped]

            wcs = WCS(dict(header_a))
            if not wcs.has_celestial:
                raise ValueError("no celestial WCS")
            x, y = wcs.all_world2pix([[ra_deg, dec_deg]], 0)[0]
            half = 6
            x0, x1 = max(int(x) - half, 0), min(int(x) + half + 1, img_a.shape[1])
            y0, y1 = max(int(y) - half, 0), min(int(y) + half + 1, img_a.shape[0])
            if x1 <= x0 or y1 <= y0:
                raise ValueError("target outside cutout")
            pos_a = self._centroid(img_a[y0:y1, x0:x1], mask_a[y0:y1, x0:x1])
            pos_b = self._centroid(
                aligned_b[y0:y1, x0:x1], (footprint[y0:y1, x0:x1] > 0)
            )
            if pos_a is None or pos_b is None:
                raise ValueError("centroid failed (masked/empty window)")
            world_a = wcs.all_pix2world([[pos_a[0] + x0, pos_a[1] + y0]], 0)[0]
            world_b = wcs.all_pix2world([[pos_b[0] + x0, pos_b[1] + y0]], 0)[0]
            sep_deg = float(
                np.sqrt(
                    ((world_a[0] - world_b[0]) * np.cos(np.deg2rad(world_a[1]))) ** 2
                    + (world_a[1] - world_b[1]) ** 2
                )
            )
            scale = self._pixel_scale_arcsec(wcs)
            out = {
                "measured": True,
                "ra_a_deg": float(world_a[0]),
                "dec_a_deg": float(world_a[1]),
                "ra_b_deg": float(world_b[0]),
                "dec_b_deg": float(world_b[1]),
                "separation_arcsec": sep_deg * ARCSEC_PER_DEG,
                "separation_err_arcsec": scale,
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
