"""Synthetic FITS fixtures — TEST ONLY. Never exposed to users.

Builds a minimal 2-HDU FITS (primary + image) in memory to exercise the
processing service without touching the archive.
"""

import io

import pytest

np = pytest.importorskip("numpy")
fits = pytest.importorskip("astropy.io.fits")

from app.services.fits_processing import FITSProcessingService


def _synthetic_fits(n: int = 32, value: float = 1.5) -> bytes:
    data = np.full((n, n), value, dtype=np.float32)
    data[10:14, 10:14] = 25.0  # bright test blob
    hdu = fits.ImageHDU(data=data, name="IMAGE")
    hdu.header["BUNIT"] = "MJy/sr"
    hdul = fits.HDUList([fits.PrimaryHDU(), hdu])
    buffer = io.BytesIO()
    hdul.writeto(buffer)
    return buffer.getvalue()


def test_summarize_synthetic():
    service = FITSProcessingService()
    summary = service.summarize(_synthetic_fits())
    assert summary["hdu_count"] == 2
    assert summary["quality"]["valid_fraction"] == 1.0
    assert summary["quality"]["max_mjy_sr"] == 25.0


def test_preview_renders_png():
    service = FITSProcessingService()
    png = service.render_preview(_synthetic_fits())
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_rejects_non_fits():
    service = FITSProcessingService()
    try:
        service.summarize(b"definitely not fits")
    except ValueError:
        return
    raise AssertionError("non-FITS bytes must be rejected")
