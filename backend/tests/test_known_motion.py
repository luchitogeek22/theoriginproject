"""S3 + S4: measured motion and the known-motion stack on the same frames as the motion video."""

import pathlib
import sys
import time

import numpy as np
import pytest
from astropy.time import Time
from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import synthetic  # noqa: E402

from app.main import app  # noqa: E402
from app.routers import sequences as sequences_router  # noqa: E402
from app.services import catalogs, cutout_store  # noqa: E402
from app.services.targets import propagate  # noqa: E402

client = TestClient(app)
URL = "https://irsa.ipac.caltech.edu/ibe/data/spherex/"
RA0, DEC0 = 210.0, -30.0
PM_RA, PM_DEC = 0.0, 20000.0
EPOCH = "2025-08-01T00:00:00"


def items(n):
    return [
        {
            "obs_id": f"o{k}", "product_id": f"spherex_qr2/o{k}/D6", "collection": "spherex_qr2",
            "detector": 6, "t_min_mjd": 60800.0 + 60 * k, "t_max_mjd": 60800.001 + 60 * k,
            "ra_deg": RA0, "dec_deg": DEC0, "access_url": f"{URL}o{k}_D6.fits",
            "date_obs": "", "instrument": "", "band": "", "dataproduct_type": "",
            "access_format": "", "filesize_bytes": None, "s_region": "",
        }
        for k in range(n)
    ]


@pytest.fixture
def mover(monkeypatch):
    """A source that really moves at (PM_RA, PM_DEC) from EPOCH; no network for IRSA or Gaia."""
    state = {"items": items(6), "downloads": 0, "peak": 40.0}
    monkeypatch.setattr(
        sequences_router.gateway, "search",
        lambda *a, **k: {"items": state["items"], "warnings": [], "count": len(state["items"])},
    )

    def download(url, dest_hint=""):
        state["downloads"] += 1
        k = int(url.split("/o")[1].split("_")[0])
        mjd = 60800.0 + 60 * k
        ra, dec = propagate(RA0, DEC0, PM_RA, PM_DEC, None, EPOCH, Time(mjd, format="mjd"))
        data = synthetic.make_fits(
            sources=[(ra, dec, state["peak"])], center=(RA0, DEC0), seed=k, mjd=mjd, noise=0.2,
        )
        return data, url

    monkeypatch.setattr(cutout_store.gateway, "download", download)
    monkeypatch.setattr(catalogs, "_gaia_query", lambda *a, **k: [])
    return state


def run(**overrides):
    body = {"ra_deg": RA0, "dec_deg": DEC0, "size_arcmin": 6.0, "mode": "motion",
            "pm_ra_mas_yr": PM_RA, "pm_dec_mas_yr": PM_DEC, "ref_epoch": EPOCH, **overrides}
    job = client.post("/api/v1/sequences", json=body).json()
    done = client.get(f"/api/v1/jobs/{job['job_id']}/results").json()
    assert done["status"] == "completed", done
    return done["result"]


def test_motion_sequence_measures_the_known_motion_on_its_own_frames(mover):
    result = run()
    downloads = mover["downloads"]
    known = result["known_motion"]
    assert known["ok"] is True and known["reason"] is None
    reference = known["reference"]
    assert reference["pm_ra_mas_yr"] == PM_RA and reference["pm_dec_mas_yr"] == PM_DEC
    assert reference["total_arcsec_yr"] == pytest.approx(20.0)
    assert reference["source"]
    detection = known["detection"]
    assert detection["n_visits"] == result["n_used"] == 6
    for field in ("observed_sigma", "p_value", "sigma_equivalent", "offset_px"):
        assert isinstance(detection[field], float)
    assert detection["median_frame_snr"] == pytest.approx(result["lightcurve"]["target_median_snr"])
    measured = known["measured"]
    assert measured["measurable"] is True
    years = measured["baseline_days"] / 365.25
    assert measured["predicted_arcsec_yr"] == pytest.approx(measured["predicted_arcsec"] / years)
    assert measured["measured_arcsec_yr"] == pytest.approx(measured["measured_arcsec"] / years)
    assert measured["predicted_arcsec_yr"] == pytest.approx(20.0, rel=0.01)
    assert measured["measured_arcsec_yr"] == pytest.approx(20.0, abs=6.0)
    assert measured["agreement_sigma"] == pytest.approx(
        measured["difference_arcsec"] / measured["uncertainty_arcsec"]
    )
    assert known["stack_png_url"] == f"/api/v1/sequences/{result['key']}/known_motion.png"
    png = client.get(known["stack_png_url"])
    assert png.status_code == 200 and png.headers["content-type"] == "image/png"
    assert isinstance(known["limitations"], list) and known["limitations"]
    assert mover["downloads"] == 6 == downloads


def test_a_faint_target_keeps_the_detection_and_says_the_motion_is_not_measurable(mover):
    mover["peak"] = 0.0
    known = run(ra_deg=RA0 + 0.001)["known_motion"]
    assert known["ok"] is True
    assert known["measured"]["measurable"] is False and known["measured"]["reason"]
    assert "p_value" in known["detection"]


def test_without_a_known_proper_motion_the_result_says_so(mover):
    result = run(ra_deg=RA0 + 0.002, pm_ra_mas_yr=None, pm_dec_mas_yr=None, ref_epoch=None)
    known = result["known_motion"]
    assert known["ok"] is False
    assert known["reason"] == "No proper motion is known for this position, so the known-motion check was not run."
    assert "stack_png_url" not in known


def test_with_fewer_than_four_frames_the_result_says_so(mover):
    mover["items"] = items(3)
    known = run(ra_deg=RA0 + 0.003)["known_motion"]
    assert known["ok"] is False
    assert known["reason"] == "At least 4 frames are needed for the known-motion check; found 3."


def test_a_field_too_large_to_check_quickly_is_skipped_with_a_reason(mover):
    known = run(ra_deg=RA0 + 0.004, size_arcmin=16.0)["known_motion"]
    assert known["ok"] is False
    assert known["reason"].startswith("The field is too large to run the known-motion check quickly")


def test_brightness_mode_carries_no_known_motion(mover):
    result = run(ra_deg=RA0 + 0.005, mode="brightness")
    assert "known_motion" not in result


def test_the_known_motion_check_adds_little_time_on_a_six_arcmin_field(mover):
    from app.services.sequence import FrameInput, render_sequence
    from app.services.sequence_extras import build_known_motion

    frames = []
    for k in range(12):
        data, _ = cutout_store.gateway.download(f"{URL}o{k}_D6.fits")
        frames.append(FrameInput(meta={"obs_id": f"o{k}", "detector": 6, "t_min_mjd": 60800.0 + 60 * k}, data=data))
    rendered = render_sequence(frames, RA0, DEC0, 6.0, "motion")
    size_px = rendered.result["grid"]["size_px"]
    assert size_px == 59
    params = {"ra_deg": RA0, "dec_deg": DEC0, "pm_ra_mas_yr": PM_RA, "pm_dec_mas_yr": PM_DEC, "ref_epoch": EPOCH}
    start = time.perf_counter()
    known = build_known_motion(rendered.warped, size_px, params)
    elapsed = time.perf_counter() - start
    print(f"known_motion on {size_px}px x 12 frames: {elapsed:.2f}s")
    assert known["ok"] is True
    assert elapsed < 5.0
    assert np.isfinite(known["detection"]["observed_sigma"])


@pytest.mark.parametrize("lightcurve", [
    {"method": "psf_wings", "target_flagged_fraction": 0.0},
    {"method": "aperture", "target_flagged_fraction": 0.75},
])
def test_a_saturated_or_flagged_target_is_not_measured_but_keeps_the_detection(mover, lightcurve):
    from app.services.sequence import FrameInput, render_sequence
    from app.services.sequence_extras import build_known_motion

    frames = []
    for k in range(12):
        data, _ = cutout_store.gateway.download(f"{URL}o{k}_D6.fits")
        frames.append(FrameInput(meta={"obs_id": f"o{k}", "detector": 6, "t_min_mjd": 60800.0 + 60 * k}, data=data))
    rendered = render_sequence(frames, RA0, DEC0, 6.0, "motion")
    params = {"ra_deg": RA0, "dec_deg": DEC0, "pm_ra_mas_yr": PM_RA, "pm_dec_mas_yr": PM_DEC, "ref_epoch": EPOCH}
    known = build_known_motion(rendered.warped, rendered.result["grid"]["size_px"], params, lightcurve=lightcurve)
    assert known["ok"] is True
    assert known["measured"] == {
        "measurable": False,
        "reason": "The target saturates or is flagged in most frames of this detector, so its position cannot be measured reliably.",
    }
    assert np.isfinite(known["detection"]["observed_sigma"])
