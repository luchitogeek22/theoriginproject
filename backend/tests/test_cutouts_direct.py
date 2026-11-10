"""Portal-free cutout tests: a preview failure degrades honestly.

When the PNG preview cannot be rendered, the cutout still succeeds with the
real FITS bytes stored, an empty preview_url, and a warning. Success is never
faked with placeholder imagery.
"""

import io

import pytest

np = pytest.importorskip("numpy")
fits = pytest.importorskip("astropy.io.fits")
pytest.importorskip("fastapi")
pytest.importorskip("sqlalchemy")

from app.database import SessionLocal, init_db
from app.models import Observation
from app.routers import cutouts as cutouts_router
from app.schemas import CutoutRequest
from app.services.fits_processing import sha256_bytes


def _nan_fits() -> bytes:
    """Synthetic all-NaN FITS (TEST ONLY): summarizable, not previewable."""
    data = np.full((16, 16), np.nan, dtype=np.float32)
    hdu = fits.ImageHDU(data=data, name="IMAGE")
    hdul = fits.HDUList([fits.PrimaryHDU(), hdu])
    buffer = io.BytesIO()
    hdul.writeto(buffer)
    return buffer.getvalue()


def test_cutout_without_preview_keeps_real_data_and_warns(monkeypatch):
    init_db()
    db = SessionLocal()
    try:
        obs = Observation(
            obs_id="cutout-test-o1",
            collection="spherex_qr3",
            access_url="https://example.invalid/x.fits",
        )
        db.add(obs)
        db.commit()
        db.refresh(obs)
        payload = _nan_fits()
        monkeypatch.setattr(
            cutouts_router.gateway, "download", lambda url, dest_hint="": (payload, url)
        )
        res = cutouts_router.create_cutout(
            CutoutRequest(observation_id=obs.id, ra_deg=10.0, dec_deg=10.0, size_arcmin=6.0),
            db,
        )
    finally:
        db.close()
    assert res.preview_url == ""
    assert "Preview unavailable" in res.warning
    assert res.size_bytes == len(payload)
    # The stored bytes are exactly what was "downloaded": no placeholder.
    assert res.sha256 == sha256_bytes(payload)
