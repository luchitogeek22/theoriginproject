"""WP-12: temporal/differential engine on synthetic frames with known truth."""

import pathlib
import sys

import numpy as np
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import synthetic  # noqa: E402

from app.services.temporal import IncompatibleError, TemporalAnalysisEngine  # noqa: E402

RA0, DEC0 = 150.0, 2.0
SCALE_DEG = 6.15 / 3600.0
SHAPE = (36, 36)
engine = TemporalAnalysisEngine()


def pair(a_sources, b_sources, seed, noise=0.2, b_center=(RA0, DEC0), det_a=6, det_b=6):
    a = synthetic.make_fits(a_sources, shape=SHAPE, center=(RA0, DEC0), noise=noise, seed=2 * seed,
                            mjd=60800.0, detector=det_a)
    b = synthetic.make_fits(b_sources, shape=SHAPE, center=b_center, noise=noise, seed=2 * seed + 1,
                            mjd=60900.0, detector=det_b)
    return a, b


def compare(a, b, **kw):
    kw.setdefault("render_images", False)
    return engine.compare(a, b, {"detector": 6}, {"detector": 6}, ra_deg=RA0, dec_deg=DEC0, **kw)


@pytest.mark.slow
def test_pure_noise_rarely_yields_a_measurement():
    hits = 0
    for seed in range(200):
        a, b = pair([], [], seed)
        result = compare(a, b)
        hits += bool(result["astrometry"]["measured"])
    assert hits / 200 <= 0.02


def test_injected_shift_is_recovered():
    shift_px = 10.4 / 6.15
    separations = []
    for seed in range(20):
        a, b = pair(
            [(RA0, DEC0, 10.0)], [(RA0 + shift_px * SCALE_DEG / np.cos(np.deg2rad(DEC0)), DEC0, 10.0)], seed
        )
        astrometry = compare(a, b)["astrometry"]
        assert astrometry["measured"]
        separations.append(astrometry["separation_arcsec"])
    assert abs(np.median(separations) - 10.4) < 1.5


@pytest.mark.slow
def test_static_source_is_almost_never_a_moving_candidate():
    moving = 0
    for seed in range(200):
        a, b = pair([(RA0, DEC0, 10.0)], [(RA0, DEC0, 10.0)], seed)
        astrometry = compare(a, b)["astrometry"]
        moving += bool(astrometry.get("significant"))
    assert moving / 200 <= 0.05


def test_moving_source_is_significant_and_has_a_real_uncertainty():
    shift = 3.0 * SCALE_DEG / np.cos(np.deg2rad(DEC0))
    a, b = pair([(RA0, DEC0, 10.0)], [(RA0 + shift, DEC0, 10.0)], 5)
    astrometry = compare(a, b)["astrometry"]
    assert astrometry["significant"] is True
    assert 0 < astrometry["separation_err_arcsec"] < 6.15


def test_a_flux_drop_is_detected_and_labelled_as_a_decrease():
    a, b = pair([(RA0 + 8 * SCALE_DEG, DEC0, 12.0)], [], 3)
    detections = compare(a, b)["detections"]
    assert detections
    assert detections[0]["direction"] == "decrease"


def test_a_flux_rise_is_labelled_as_an_increase():
    a, b = pair([], [(RA0 + 8 * SCALE_DEG, DEC0, 12.0)], 4)
    assert compare(a, b)["detections"][0]["direction"] == "increase"


def test_detection_coordinates_are_the_sources_own_centroid():
    truth = (RA0 + 6 * SCALE_DEG / np.cos(np.deg2rad(DEC0)), DEC0 + 5 * SCALE_DEG)
    a, b = pair([], [(truth[0], truth[1], 15.0)], 7)
    det = compare(a, b)["detections"][0]
    separation_px = np.hypot(
        (det["ra_deg"] - truth[0]) * np.cos(np.deg2rad(DEC0)), det["dec_deg"] - truth[1]
    ) / SCALE_DEG
    assert separation_px < 1.0
    assert (det["ra_deg"], det["dec_deg"]) != (0.0, 0.0)


def test_detections_have_no_coordinates_without_a_wcs(monkeypatch):
    a, b = pair([], [(RA0 + 6 * SCALE_DEG, DEC0, 15.0)], 8)
    from app.services import fits_processing

    original = fits_processing.FITSProcessingService.load_science_arrays

    def without_wcs(self, data):
        bundle = original(self, data)
        bundle["wcs"] = None
        return bundle

    monkeypatch.setattr(fits_processing.FITSProcessingService, "load_science_arrays", without_wcs)
    result = compare(a, b)
    assert all(d["ra_deg"] is None for d in result["detections"])
    assert result["astrometry"]["measured"] is False


def test_min_detection_size_is_configurable():
    a, b = pair([], [(RA0 + 6 * SCALE_DEG, DEC0, 6.0)], 9)
    default = len(compare(a, b)["detections"])
    huge = len(compare(a, b, min_pixels=200)["detections"])
    assert default >= 1 and huge == 0


def test_different_detectors_are_rejected():
    a, b = pair([], [], 1, det_b=2)
    with pytest.raises(IncompatibleError):
        engine.compare(a, b, {"detector": 6}, {"detector": 2})
    with pytest.raises(IncompatibleError):
        engine.compare(a, b, {"detector": ""}, {"detector": ""})


@pytest.mark.slow
def test_faint_static_source_is_rarely_a_moving_candidate():
    moving = 0
    for seed in range(120):
        a, b = pair([(RA0, DEC0, 3.0)], [(RA0, DEC0, 3.0)], 500 + seed, noise=0.5)
        astrometry = compare(a, b)["astrometry"]
        moving += bool(astrometry.get("significant"))
    assert moving / 120 <= 0.05


def test_a_source_straddling_ra_zero_has_no_absurd_separation():
    flagged = 0
    for seed in range(12):
        a = synthetic.make_fits([(0.0, DEC0, 10.0)], shape=SHAPE, center=(0.0, DEC0), noise=0.2, seed=2 * seed, mjd=60800.0)
        b = synthetic.make_fits([(0.0, DEC0, 10.0)], shape=SHAPE, center=(0.0, DEC0), noise=0.2, seed=2 * seed + 1, mjd=60900.0)
        astrometry = engine.compare(
            a, b, {"detector": 6}, {"detector": 6}, ra_deg=0.0, dec_deg=DEC0, render_images=False
        )["astrometry"]
        if astrometry["measured"]:
            assert astrometry["separation_arcsec"] < 30.0
            flagged += bool(astrometry["significant"])
    assert flagged == 0


def test_psf_matching_keeps_the_difference_noise_calibrated():
    zs = []
    for seed in range(6):
        a = synthetic.make_fits([], shape=(64, 64), noise=0.5, seed=seed, fwhm_pix=2.0, mjd=60800.0)
        b = synthetic.make_fits([], shape=(64, 64), noise=0.5, seed=100 + seed, fwhm_pix=2.2, mjd=60900.0)
        bundle_a = engine.fits.load_science_arrays(a)
        bundle_b = engine.fits.load_science_arrays(b)
        img_a, mask_a = engine._masked(bundle_a)
        img_b, mask_b = engine._masked(bundle_b)
        img_a, mask_a, img_b, mask_b = engine._match_psf(bundle_a, bundle_b, img_a, mask_a, img_b, mask_b, [])
        sigma = np.sqrt(bundle_a["variance"] + bundle_b["variance"])
        zs.append(((img_a - img_b) / sigma)[mask_a & mask_b][10:-10])
    assert np.std(np.concatenate(zs)) == pytest.approx(1.0, abs=0.06)
