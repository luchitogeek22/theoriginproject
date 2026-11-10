"""FITS processing for SPHEREx multi-extension products.

HDU layout (1-based, per SPHEREx docs):
  1 IMAGE (MJy/sr), 2 FLAGS, 3 VARIANCE, 4 ZODI, 5 PSF, 6 WCS-WAVE.

SPHEREx carries 6 detectors and 102 spectral channels (0.75-5 um) via a
linear variable filter. Detectors are never treated as bands, and images
from different detectors are never co-added.
"""

import hashlib
import io
from typing import Any

import numpy as np

from app.logging import get_logger

log = get_logger("fits")

HDU_NAMES = {1: "IMAGE", 2: "FLAGS", 3: "VARIANCE", 4: "ZODI", 5: "PSF", 6: "WCS-WAVE"}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class FITSProcessingService:
    def summarize(self, data: bytes) -> dict[str, Any]:
        """Validate extensions and extract metadata + quality stats. No invention."""
        from astropy.io import fits  # type: ignore[import-untyped]

        summary: dict[str, Any] = {
            "sha256": sha256_bytes(data),
            "size_bytes": len(data),
            "hdu_count": 0,
            "extensions": [],
            "wcs": {},
            "quality": {},
            "warnings": [],
        }
        try:
            hdul = fits.open(io.BytesIO(data), memmap=False)
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"Not a readable FITS file: {exc}") from exc
        with hdul:
            summary["hdu_count"] = len(hdul)
            for index, hdu in enumerate(hdul):
                header = dict(hdu.header) if hasattr(hdu, "header") else {}
                entry: dict[str, Any] = {
                    "index": index,
                    "name": str(getattr(hdu, "name", "") or HDU_NAMES.get(index, "")),
                    "shape": list(getattr(hdu.data, "shape", []) or []),
                    "dtype": str(getattr(hdu.data, "dtype", "")),
                    "bunit": str(header.get("BUNIT", "")),
                }
                summary["extensions"].append(entry)
            image_hdu = hdul[1] if len(hdul) > 1 else hdul[0]
            image = np.asarray(image_hdu.data, dtype=np.float64) if image_hdu.data is not None else None
            flags = np.asarray(hdul[2].data) if len(hdul) > 2 and hdul[2].data is not None else None
            variance = (
                np.asarray(hdul[3].data, dtype=np.float64)
                if len(hdul) > 3 and hdul[3].data is not None
                else None
            )
            if image is None:
                summary["warnings"].append("IMAGE extension has no pixel data.")
                return summary
            valid = np.isfinite(image)
            if flags is not None and flags.shape == image.shape:
                valid &= flags == 0
                flagged_fraction = float(1.0 - np.mean(flags == 0))
            else:
                flagged_fraction = 0.0
                if len(hdul) > 2:
                    summary["warnings"].append("FLAGS shape mismatch or unreadable; ignored.")
            pixels = image[valid]
            if pixels.size == 0:
                summary["warnings"].append("No valid pixels after quality masking.")
                summary["quality"] = {"valid_fraction": 0.0}
                return summary
            summary["quality"] = {
                "valid_fraction": float(valid.mean()),
                "flagged_fraction": flagged_fraction,
                "median_mjy_sr": float(np.median(pixels)),
                "mean_mjy_sr": float(np.mean(pixels)),
                "std_mjy_sr": float(np.std(pixels)),
                "min_mjy_sr": float(np.min(pixels)),
                "max_mjy_sr": float(np.max(pixels)),
                "p1_mjy_sr": float(np.percentile(pixels, 1)),
                "p99_mjy_sr": float(np.percentile(pixels, 99)),
            }
            if variance is not None and variance.shape == image.shape:
                var = variance[valid]
                var = var[np.isfinite(var) & (var > 0)]
                if var.size:
                    summary["quality"]["median_sigma_mjy_sr"] = float(np.median(np.sqrt(var)))
            summary["wcs"] = self._wcs_summary(image_hdu.header)
            summary["wave_table"] = self._wave_summary(hdul)
        return summary

    @staticmethod
    def _wcs_summary(header) -> dict[str, Any]:
        try:
            from astropy.wcs import WCS  # type: ignore[import-untyped]

            wcs = WCS(header)
            if not wcs.has_celestial:
                return {"has_celestial": False}
            return {
                "has_celestial": True,
                "ctype": [str(c) for c in wcs.wcs.ctype],
                "crval": [float(v) for v in wcs.wcs.crval],
                "crpix": [float(v) for v in wcs.wcs.crpix],
                "pixel_scale_arcsec": FITSProcessingService._pixel_scale(wcs),
            }
        except Exception as exc:  # noqa: BLE001
            return {"has_celestial": False, "error": str(exc)}

    @staticmethod
    def _pixel_scale(wcs) -> float | None:
        try:
            from astropy.wcs.utils import proj_plane_pixel_scales  # type: ignore[import-untyped]

            scales = proj_plane_pixel_scales(wcs.celestial)
            return float(scales[0] * 3600.0)
        except Exception:  # noqa: BLE001
            return None

    @staticmethod
    def _wave_summary(hdul) -> dict[str, Any]:
        if len(hdul) <= 5 or hdul[5].data is None:
            return {"present": False}
        try:
            data = hdul[5].data
            names = list(getattr(data, "dtype", {}).names or [])
            preview: list[dict[str, Any]] = []
            for i in range(min(5, len(data))):
                row = {name: data[name][i].tolist() for name in names[:6]}
                preview.append({k: (v if np.ndim(v) == 0 else "array") for k, v in row.items()})
            return {"present": True, "columns": names, "rows": len(data), "preview": preview}
        except Exception as exc:  # noqa: BLE001
            return {"present": True, "error": str(exc)}

    def render_preview(self, data: bytes, size_px: int = 512) -> bytes:
        """Percentile-stretched PNG preview of the IMAGE extension (display only).

        Raises ValueError with a human-readable cause on any failure, so the
        API layer can degrade to "data without preview" instead of failing
        the whole cutout.
        """
        try:
            return self._render_preview_inner(data, size_px)
        except ValueError:
            raise
        except Exception as exc:  # noqa: BLE001 - normalized for the API layer
            raise ValueError(f"preview render failed: {type(exc).__name__}: {exc}") from exc

    @staticmethod
    def _render_preview_inner(data: bytes, size_px: int) -> bytes:
        from astropy.io import fits  # type: ignore[import-untyped]
        from PIL import Image  # type: ignore[import-untyped]

        with fits.open(io.BytesIO(data), memmap=False) as hdul:
            hdu = hdul[1] if len(hdul) > 1 else hdul[0]
            if hdu.data is None:
                raise ValueError("No image data for preview.")
            image = np.asarray(hdu.data, dtype=np.float64)
        finite = image[np.isfinite(image)]
        if finite.size == 0:
            raise ValueError("No finite pixels for preview.")
        lo, hi = np.percentile(finite, (1, 99))
        if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
            lo, hi = float(np.min(finite)), float(np.max(finite))
            if hi <= lo:
                hi = lo + 1.0
        stretched = np.clip((image - lo) / (hi - lo), 0, 1)
        stretched[~np.isfinite(image)] = 0.0
        pixels = (stretched * 255).astype(np.uint8)
        img = Image.fromarray(pixels)
        img.thumbnail((size_px, size_px))
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        return buffer.getvalue()

    def load_science_arrays(self, data: bytes) -> dict[str, Any]:
        """Return IMAGE/VARIANCE/FLAGS arrays + header for the analysis engines."""
        from astropy.io import fits  # type: ignore[import-untyped]

        with fits.open(io.BytesIO(data), memmap=False) as hdul:
            hdu = hdul[1] if len(hdul) > 1 else hdul[0]
            if hdu.data is None:
                raise ValueError("IMAGE extension has no data.")
            image = np.asarray(hdu.data, dtype=np.float64)
            header = dict(hdu.header)
            flags = None
            variance = None
            if len(hdul) > 2 and hdul[2].data is not None:
                candidate = np.asarray(hdul[2].data)
                flags = candidate if candidate.shape == image.shape else None
            if len(hdul) > 3 and hdul[3].data is not None:
                candidate = np.asarray(hdul[3].data, dtype=np.float64)
                variance = candidate if candidate.shape == image.shape else None
        return {"image": image, "variance": variance, "flags": flags, "header": header}
