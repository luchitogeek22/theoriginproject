"""Spectral engine: aperture profile vs wavelength from the WCS-WAVE lookup table.

Visualization-grade: WCS-WAVE maps each pixel to a wavelength for the linear
variable filter. Science-grade fluxes require the CWAVE/CBAND calibration
products — the engine says so explicitly and never invents a profile.
No molecular identification is performed.
"""

from typing import Any

import numpy as np

from app.logging import get_logger
from app.services.spherex_product import read_product

log = get_logger("spectral")


class SpectralAnalysisEngine:

    def extract(self, data: bytes, meta: dict[str, Any], ra_deg: float, dec_deg: float) -> dict[str, Any]:
        product = read_product(data)
        limitations = [
            "Visualization-grade profile from WCS-WAVE. Science-grade fluxes "
            "require CWAVE/CBAND calibration products for this detector/position.",
            "No molecular features are identified by this engine.",
            "Zodiacal light (ZODI) was subtracted from IMAGE.",
        ]
        limitations.extend(product.warnings)
        image = product.science_image
        x, y = self._sky_to_pixel(product, ra_deg, dec_deg, limitations)
        wave = self._wavelength_axis(product, x, limitations)
        samples = self._aperture_profile(image, product.variance, product.quality_mask, x, wave)
        return {
            "data_class": "COMPUTED_MEASUREMENT",
            "obs_id": str(meta.get("obs_id", "")),
            "collection": str(meta.get("collection", "")),
            "detector": str(meta.get("detector", "")),
            "band": str(meta.get("band", "")),
            "date_obs": str(meta.get("date_obs", "")),
            "pixel": {"x": x, "y": y},
            "wavelength_unit": "micron",
            "flux_unit": product.bunit or "MJy/sr",
            "samples": samples,
            "n_samples": len(samples),
            "limitations": limitations,
        }

    @staticmethod
    def _wavelength_axis(product, x: int, limitations: list[str]) -> np.ndarray | None:
        """Wavelength of every image row along column x, from the WCS-WAVE lookup table."""
        if product.wave_wcs is None:
            limitations.append("WCS-WAVE unavailable; samples carry pixel rows instead.")
            return None
        rows = np.arange(product.image.shape[0], dtype=float)
        pixels = np.column_stack([np.full_like(rows, x, dtype=float), rows])
        return product.wavelengths_at(pixels)[:, 0]

    @staticmethod
    def _sky_to_pixel(product, ra_deg, dec_deg, limitations) -> tuple[int, int]:
        shape = product.image.shape
        try:
            x, y = product.pixel_of(ra_deg, dec_deg)
            return int(np.clip(round(x), 0, shape[1] - 1)), int(np.clip(round(y), 0, shape[0] - 1))
        except Exception as exc:  # noqa: BLE001
            limitations.append(f"WCS unavailable ({exc}); cutout center used.")
            return shape[1] // 2, shape[0] // 2

    @staticmethod
    def _aperture_profile(image, variance, quality, x, wave) -> list[dict[str, Any]]:
        half = 2
        x0, x1 = max(x - half, 0), min(x + half + 1, image.shape[1])
        samples: list[dict[str, Any]] = []
        for row in range(image.shape[0]):
            strip = image[row, x0:x1].astype(np.float64)
            ok = np.isfinite(strip) & quality[row, x0:x1]
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


SPECTRUM_LABEL = "relative spectrophotometry, no aperture correction"


def spectrophotometry(
    exposures: list[tuple[dict[str, Any], Any]],
    ra_deg: float,
    dec_deg: float,
    positions: list[tuple[float, float]] | None = None,
) -> dict[str, Any]:
    """Flux against wavelength from aperture photometry of every exposure at the target pixel."""
    from app.services.photometry import aperture_photometry
    from app.services.sia2_gateway import _mjd_to_iso

    points: list[dict[str, Any]] = []
    for index, (meta, product) in enumerate(exposures):
        ra, dec = positions[index] if positions else (ra_deg, dec_deg)
        measured = aperture_photometry(product, ra, dec)
        if not measured.get("ok"):
            continue
        try:
            wave, bandwidth = product.wavelength_at(measured["x"], measured["y"])
        except ValueError:
            continue
        if not np.isfinite(wave):
            continue
        points.append({
            "mjd": product.mjd_obs,
            "date_iso": _mjd_to_iso(product.mjd_obs),
            "detector": product.detector,
            "obs_id": str(meta.get("obs_id") or product.obs_id),
            "wavelength_um": float(wave),
            "bandwidth_um": float(bandwidth),
            "flux_jy": measured["flux_jy"],
            "flux_jy_err": measured["flux_jy_err"],
            "snr": measured["snr"],
            "flagged": measured["flagged"],
        })
    points.sort(key=lambda p: p["wavelength_um"])
    return {
        "label": SPECTRUM_LABEL,
        "points": points,
        "n_points": len(points),
        "color": color_thermometer(points),
        "limitations": [
            "Zodiacal light was subtracted from every exposure.",
            "Different dates are shown in different colours: brightness changes over time are not "
            "spectral shape.",
            "No aperture correction is applied.",
        ],
    }


COLOR_REFERENCES = [
    {"max_index": -0.5, "text": "flux density falls steeply towards long wavelengths, as in ordinary stars at these wavelengths"},
    {"max_index": 0.15, "text": "flatter than an ordinary star: redder than expected for a star"},
    {"max_index": 0.6, "text": "red: more flux at long wavelengths"},
    {"max_index": 1.01, "text": "very red: almost all the flux is at long wavelengths, as expected for a cold object"},
]


def color_thermometer(points: list[dict[str, Any]]) -> dict[str, Any]:
    """Normalised colour index (F_long - F_short) / (F_long + F_short) between the two ends of the band."""
    usable = [p for p in points if not p["flagged"] and p["detector"] is not None]
    by_detector: dict[int, list[dict[str, Any]]] = {}
    for p in usable:
        by_detector.setdefault(p["detector"], []).append(p)
    if len(by_detector) < 2:
        return {"available": False, "reason": "Needs exposures from at least two detectors."}

    def level(group):
        flux = np.array([p["flux_jy"] for p in group])
        err = np.array([p["flux_jy_err"] for p in group])
        mean = float(np.mean(flux))
        sigma = float(np.sqrt(np.sum(err**2)) / len(flux))
        if len(flux) > 1:
            sigma = max(sigma, float(np.std(flux, ddof=1) / np.sqrt(len(flux))))
        return mean, sigma, float(np.mean([p["wavelength_um"] for p in group]))

    levels = {d: level(g) for d, g in by_detector.items()}
    ordered = sorted(levels, key=lambda d: (levels[d][2], d))
    short, long = ordered[0], ordered[-1]
    f_short, e_short, w_short = levels[short]
    f_long, e_long, w_long = levels[long]
    total = f_long + f_short
    if total <= 0:
        return {"available": False, "reason": "No positive flux at either end of the band."}
    index = (f_long - f_short) / total
    error = 2.0 * float(np.hypot(f_short * e_long, f_long * e_short)) / total**2
    reading = next(r["text"] for r in COLOR_REFERENCES if index < r["max_index"])
    return {
        "available": True,
        "index": float(index),
        "index_err": error,
        "short": {"detector": short, "wavelength_um": w_short, "flux_jy": f_short, "flux_jy_err": e_short},
        "long": {"detector": long, "wavelength_um": w_long, "flux_jy": f_long, "flux_jy_err": e_long},
        "reading": reading,
        "reference_note": "Qualitative reference only; this is not a calibrated spectral classification.",
    }
