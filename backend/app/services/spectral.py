"""Spectral engine: aperture profile vs wavelength from the WCS-WAVE table.

Visualization-grade: WCS-WAVE maps pixel rows to wavelength for the linear
variable filter. Science-grade fluxes require the CWAVE/CBAND calibration
products — the engine says so explicitly and never invents a profile.
No molecular identification is performed.
"""

from typing import Any

import numpy as np

from app.logging import get_logger
from app.services.fits_processing import FITSProcessingService

log = get_logger("spectral")


class SpectralAnalysisEngine:
    def __init__(self) -> None:
        self.fits = FITSProcessingService()

    def extract(self, data: bytes, meta: dict[str, Any], ra_deg: float, dec_deg: float) -> dict[str, Any]:
        from astropy.io import fits  # type: ignore[import-untyped]

        limitations = [
            "Visualization-grade profile from WCS-WAVE. Science-grade fluxes "
            "require CWAVE/CBAND calibration products for this detector/position.",
            "No molecular features are identified by this engine.",
        ]
        with fits.open(io_bytes(data), memmap=False) as hdul:
            hdu = hdul[1] if len(hdul) > 1 else hdul[0]
            if hdu.data is None:
                raise ValueError("IMAGE extension has no data.")
            image = np.asarray(hdu.data, dtype=np.float64)
            header = dict(hdu.header)
            variance = None
            if len(hdul) > 3 and hdul[3].data is not None:
                candidate = np.asarray(hdul[3].data, dtype=np.float64)
                variance = candidate if candidate.shape == image.shape else None
            flags = None
            if len(hdul) > 2 and hdul[2].data is not None:
                candidate = np.asarray(hdul[2].data)
                flags = candidate if candidate.shape == image.shape else None
            wave = self._wavelength_axis(hdul, image.shape, limitations)

        x, y = self._sky_to_pixel(header, ra_deg, dec_deg, image.shape, limitations)
        samples = self._aperture_profile(image, variance, flags, x, y, wave)
        return {
            "data_class": "COMPUTED_MEASUREMENT",
            "obs_id": str(meta.get("obs_id", "")),
            "collection": str(meta.get("collection", "")),
            "detector": str(meta.get("detector", "")),
            "band": str(meta.get("band", "")),
            "date_obs": str(meta.get("date_obs", "")),
            "pixel": {"x": x, "y": y},
            "wavelength_unit": "micron",
            "flux_unit": str(header.get("BUNIT", "MJy/sr")),
            "samples": samples,
            "n_samples": len(samples),
            "limitations": limitations,
        }

    @staticmethod
    def _wavelength_axis(hdul, shape, limitations: list[str]) -> np.ndarray | None:
        """Best-effort wavelength vector from the WCS-WAVE binary table."""
        if len(hdul) <= 5 or hdul[5].data is None:
            limitations.append("WCS-WAVE extension missing; samples carry pixel rows instead.")
            return None
        try:
            table = hdul[5].data
            names = [str(n).lower() for n in (table.dtype.names or [])]
            wave_col = None
            for candidate in ("wave", "wavelength", "lambda", "cwave"):
                if candidate in names:
                    wave_col = table.dtype.names[names.index(candidate)]
                    break
            if wave_col is None:
                # Fall back to the first float column.
                for name in table.dtype.names or []:
                    column = np.asarray(table[name]).ravel()
                    if np.issubdtype(column.dtype, np.floating) and column.size >= shape[0]:
                        wave_col = name
                        break
            if wave_col is None:
                limitations.append("WCS-WAVE has no usable wavelength column.")
                return None
            wave = np.asarray(table[wave_col], dtype=np.float64).ravel()
            if wave.size != shape[0]:
                limitations.append(
                    f"WCS-WAVE length ({wave.size}) != image rows ({shape[0]}); "
                    "resampled by index."
                )
                index = np.linspace(0, wave.size - 1, shape[0]).round().astype(int)
                wave = wave[index]
            # Convert likely units to micron (best effort, recorded).
            if np.nanmedian(wave) > 50:
                wave = wave / 1000.0  # nm -> um
                limitations.append("Wavelength rescaled nm -> micron by magnitude heuristic.")
            return wave
        except Exception as exc:  # noqa: BLE001
            limitations.append(f"WCS-WAVE unreadable ({exc}); pixel rows used instead.")
            return None

    @staticmethod
    def _sky_to_pixel(header, ra_deg, dec_deg, shape, limitations) -> tuple[int, int]:
        try:
            from astropy.wcs import WCS  # type: ignore[import-untyped]

            wcs = WCS(dict(header))
            if not wcs.has_celestial:
                raise ValueError("no celestial WCS")
            x, y = wcs.all_world2pix([[ra_deg, dec_deg]], 0)[0]
            x = int(np.clip(round(x), 0, shape[1] - 1))
            y = int(np.clip(round(y), 0, shape[0] - 1))
            return x, y
        except Exception as exc:  # noqa: BLE001
            limitations.append(f"WCS unavailable ({exc}); cutout center used.")
            return shape[1] // 2, shape[0] // 2

    @staticmethod
    def _aperture_profile(image, variance, flags, x, y, wave) -> list[dict[str, Any]]:
        half = 2
        x0, x1 = max(x - half, 0), min(x + half + 1, image.shape[1])
        samples: list[dict[str, Any]] = []
        for row in range(image.shape[0]):
            strip = image[row, x0:x1].astype(np.float64)
            ok = np.isfinite(strip)
            if flags is not None:
                ok &= np.asarray(flags[row, x0:x1]) == 0
            if not ok.any():
                continue
            flux = float(np.median(strip[ok]))
            err = None
            if variance is not None:
                var = np.asarray(variance[row, x0:x1], dtype=np.float64)[ok]
                var = var[np.isfinite(var) & (var > 0)]
                if var.size:
                    err = float(np.sqrt(np.median(var) / ok.sum()))
            sample: dict[str, Any] = {"row": row, "flux": flux, "flux_err": err}
            sample["wavelength_um"] = float(wave[row]) if wave is not None else None
            samples.append(sample)
        return samples


def io_bytes(data: bytes):
    import io

    return io.BytesIO(data)
