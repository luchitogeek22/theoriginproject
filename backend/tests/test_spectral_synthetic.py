"""WP-26: spectrophotometry and the colour thermometer on synthetic exposures."""

import io
import pathlib
import sys

import numpy as np
import pytest
from astropy.io import fits

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import synthetic  # noqa: E402

from app.services.spectral import SPECTRUM_LABEL, color_thermometer, spectrophotometry  # noqa: E402
from app.services.spherex_product import read_product  # noqa: E402

RA0, DEC0 = 150.0, 2.0
PIXEL_SR = (6.15 * np.pi / 648000.0) ** 2


def exposure(peak, detector, seed, mjd=60800.0):
    data = synthetic.make_fits(
        [(RA0, DEC0, peak)], shape=(48, 48), noise=0.05, seed=seed, detector=detector, mjd=mjd
    )
    return {"obs_id": f"e{seed}", "detector": detector}, read_product(data), data


def test_a_known_source_is_recovered_within_ten_percent_at_its_own_wavelength():
    meta, product, _ = exposure(20.0, 6, 1)
    result = spectrophotometry([(meta, product)], RA0, DEC0)
    point = result["points"][0]
    sigma = 2.0 / 2.355
    expected_jy = 20.0 * 2 * np.pi * sigma**2 * PIXEL_SR * 1e6
    assert point["flux_jy"] == pytest.approx(expected_jy, rel=0.10)
    x, y = product.pixel_of(RA0, DEC0)
    assert point["wavelength_um"] == pytest.approx(product.wavelength_at(x, y)[0])
    assert point["bandwidth_um"] > 0
    assert result["label"] == SPECTRUM_LABEL


def test_extensions_in_another_order_give_the_same_result():
    meta, product, data = exposure(20.0, 6, 2)
    baseline = spectrophotometry([(meta, product)], RA0, DEC0)["points"][0]["flux_jy"]
    with fits.open(io.BytesIO(data), memmap=False) as hdul:
        shuffled = fits.HDUList([hdul[0], hdul["WCS-WAVE"], hdul["ZODI"], hdul["VARIANCE"], hdul["FLAGS"], hdul["IMAGE"]])
        buffer = io.BytesIO()
        shuffled.writeto(buffer)
    again = spectrophotometry([(meta, read_product(buffer.getvalue()))], RA0, DEC0)
    assert again["points"][0]["flux_jy"] == pytest.approx(baseline)


def test_flagged_exposures_stay_visible_but_are_marked():
    data = synthetic.make_fits(
        [(RA0, DEC0, 20.0)], shape=(48, 48), noise=0.05, seed=3, flags=np.where(
            np.indices((48, 48)).sum(axis=0) == 47, 1, 0)
    )
    result = spectrophotometry([({"obs_id": "x"}, read_product(data))], RA0, DEC0)
    assert result["points"][0]["flagged"] is True


def points_for(long_peak, short_peak, n=5):
    items = []
    for k in range(n):
        for detector, peak in ((1, short_peak), (6, long_peak)):
            meta, product, _ = exposure(peak, detector, 10 * detector + k, 60800.0 + k)
            items.append((meta, product))
    return spectrophotometry(items, RA0, DEC0)


def test_a_cold_object_and_a_flat_one_are_separated_by_the_thermometer():
    cold = points_for(long_peak=15.0, short_peak=0.3)["color"]
    flat = points_for(long_peak=15.0, short_peak=15.0)["color"]
    assert cold["available"] and flat["available"]
    separation = (cold["index"] - flat["index"]) / np.hypot(cold["index_err"], flat["index_err"])
    assert separation >= 3.0
    assert cold["index"] > 0.8 and abs(flat["index"]) < 0.15
    assert "cold" in cold["reading"]
    assert "redder than expected for a star" in flat["reading"]
    assert "not a calibrated" in cold["reference_note"]


def test_the_thermometer_needs_two_detectors():
    assert color_thermometer([])["available"] is False


def test_spectrum_job_collects_every_detector_and_the_thermometer(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app
    from app.routers import spectra as spectra_router
    from app.services import cutout_store

    items = [
        {
            "obs_id": f"o{d}{k}", "product_id": f"c/o{d}{k}/D{d}", "collection": "spherex_qr2",
            "detector": d, "t_min_mjd": 60800.0 + k, "t_max_mjd": 60800.001 + k, "ra_deg": RA0,
            "dec_deg": DEC0, "access_url": f"https://irsa.ipac.caltech.edu/x/o{d}{k}_D{d}.fits",
            "date_obs": "", "instrument": "", "band": "", "dataproduct_type": "",
            "access_format": "", "filesize_bytes": None, "s_region": "",
        }
        for d in (1, 6) for k in range(2)
    ]
    monkeypatch.setattr(
        spectra_router.gateway, "search", lambda *a, **k: {"items": items, "warnings": [], "count": 4}
    )

    def download(url, dest_hint=""):
        name = url.split("/x/")[1].split(".fits")[0]
        detector = int(name.split("_D")[1])
        return synthetic.make_fits(
            [(RA0, DEC0, 15.0 if detector == 6 else 1.0)], shape=(48, 48), noise=0.05,
            detector=detector, seed=hash(name) % 1000, mjd=60800.0,
        ), url

    monkeypatch.setattr(cutout_store.gateway, "download", download)
    client = TestClient(app)
    job = client.post(
        "/api/v1/spectra", json={"ra_deg": RA0, "dec_deg": DEC0, "per_detector": 2}
    ).json()
    done = client.get(f"/api/v1/jobs/{job['job_id']}/results").json()
    assert done["status"] == "completed", done
    result = done["result"]
    assert result["n_points"] == 4
    assert result["label"] == SPECTRUM_LABEL
    assert result["color"]["available"] is True and result["color"]["index"] > 0.5
