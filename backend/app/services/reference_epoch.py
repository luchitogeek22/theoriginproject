"""WISE/AllWISE reference frame for a sequence: another mission, another resolution.

The frame is only ever shown beside SPHEREx, never subtracted from it: the PSFs and bandpasses
differ and no matching is attempted. Failures return None so the sequence still renders.
"""

import csv
import gzip
import io
from typing import Any, Callable

import httpx
import numpy as np

from app.config import get_settings
from app.logging import get_logger

log = get_logger("reference_epoch")

BANDS = {1: ("W1", 3.4), 2: ("W2", 4.6), 3: ("W3", 12.0), 4: ("W4", 22.0)}
LABEL = "WISE reference frame (other mission, other resolution; not comparable pixel by pixel)"


def wanted_band(wavelength_um: float | None) -> int:
    """AllWISE band number closest to a SPHEREx wavelength, restricted to W1 and W2."""
    if wavelength_um is None:
        return 2
    return 1 if abs(wavelength_um - 3.4) <= abs(wavelength_um - 4.6) else 2


def search_wise(ra: float, dec: float, transport: httpx.BaseTransport | None = None) -> list[dict[str, Any]]:
    settings = get_settings()
    extra = {"transport": transport} if transport else {}
    with httpx.Client(timeout=settings.irsa_timeout_seconds, **extra) as client:
        response = client.get(
            f"{settings.wise_ibe_url}/search/wise/allwise/p3am_cdd",
            params={"POS": f"{ra:.6f},{dec:.6f}", "mcen": "true", "ct": "csv"},
        )
        response.raise_for_status()
    return [dict(row) for row in csv.DictReader(io.StringIO(response.text))]


def pick_row(rows: list[dict[str, Any]], band: int) -> dict[str, Any] | None:
    candidates = [r for r in rows if str(r.get("band")) == str(band) and r.get("coadd_id")]
    if not candidates:
        return None
    return max(candidates, key=lambda r: float(r.get("dist_to_edge") or 0.0))


def cutout_url(row: dict[str, Any], band: int, ra: float, dec: float, size_arcmin: float) -> str:
    coadd = row["coadd_id"]
    return (
        f"{get_settings().wise_ibe_url}/data/wise/allwise/p3am_cdd/{coadd[:2]}/{coadd[:4]}/{coadd}/"
        f"{coadd}-w{band}-int-3.fits?center={ra:.6f},{dec:.6f}&size={size_arcmin / 60.0:.5f}deg"
    )


def reproject_reference(data: bytes, grid, n: int) -> np.ndarray:
    from astropy.io import fits  # type: ignore[import-untyped]
    from astropy.stats import sigma_clipped_stats  # type: ignore[import-untyped]
    from astropy.wcs import WCS  # type: ignore[import-untyped]
    from reproject import reproject_interp  # type: ignore[import-untyped]

    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    with fits.open(io.BytesIO(data), memmap=False) as hdul:
        hdu = next(h for h in hdul if h.data is not None and h.data.ndim == 2)
        image = np.asarray(hdu.data, dtype=float)
        wcs = WCS(hdu.header).celestial
    finite = np.isfinite(image)
    _, background, _ = sigma_clipped_stats(image[finite], sigma=3.0)
    out, _ = reproject_interp((image - background, wcs), grid, shape_out=(n, n))
    return np.asarray(out, dtype=float)


def reference_png(image: np.ndarray) -> bytes:
    from PIL import Image  # type: ignore[import-untyped]

    finite = image[np.isfinite(image)]
    lo, hi = (np.percentile(finite, (1, 99.7)) if finite.size else (0.0, 1.0))
    hi = hi if hi > lo else lo + 1.0
    level = np.round(np.clip(np.nan_to_num((image - lo) / (hi - lo)), 0, 1) * 255).astype(np.uint8)
    rgb = np.stack([level, level, level], axis=-1)
    rgb[~np.isfinite(image)] = (58, 66, 84)
    buffer = io.BytesIO()
    Image.fromarray(np.flipud(rgb), "RGB").save(buffer, format="PNG")
    return buffer.getvalue()


def build_reference(
    ra: float,
    dec: float,
    size_arcmin: float,
    wavelength_um: float | None,
    grid,
    n: int,
    downloader: Callable[[str, str], tuple[bytes, str]],
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any] | None:
    band = wanted_band(wavelength_um)
    try:
        row = pick_row(search_wise(ra, dec, transport), band)
        if row is None:
            return None
        data, _ = downloader(cutout_url(row, band, ra, dec, size_arcmin * 1.2), row["coadd_id"])
        png = reference_png(reproject_reference(data, grid, n))
    except Exception as exc:  # noqa: BLE001 - the reference is optional
        log.warning("reference frame unavailable: %s", exc)
        return None
    name, centre = BANDS[band]
    return {
        "png": png,
        "label": LABEL,
        "band": name,
        "band_wavelength_um": centre,
        "survey": "AllWISE Atlas",
        "coadd_id": row["coadd_id"],
        "epoch_iso": str(row.get("mid_obs", "")),
    }
