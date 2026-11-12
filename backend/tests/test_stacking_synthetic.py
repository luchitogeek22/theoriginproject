"""WP-20: inverse-variance stacking, motion-following stacks and PSF matching."""

import pathlib
import sys

import numpy as np
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import synthetic  # noqa: E402

from app.services.sequence import FrameInput, motion_shifts, reproject_frames, common_grid, stack_weighted  # noqa: E402
from app.services.spherex_product import read_product  # noqa: E402
from app.services.temporal import TemporalAnalysisEngine  # noqa: E402

RA0, DEC0 = 150.0, 2.0
SCALE_DEG = 6.15 / 3600.0


def warped(sources_per_frame, noise=0.5, shape=(48, 48)):
    kept = []
    for k, sources in enumerate(sources_per_frame):
        data = synthetic.make_fits(sources, shape=shape, noise=noise, seed=100 + k, mjd=60800.0 + 30 * k)
        kept.append((FrameInput({"obs_id": f"o{k}"}, data), read_product(data)))
    grid, n = common_grid(RA0, DEC0, 4.5)
    return reproject_frames(kept, grid, n, RA0, DEC0)


def test_stack_noise_falls_as_the_square_root_of_n():
    frames = warped([[] for _ in range(9)])
    images = [w["image"] for w in frames]
    variances = [w["variance"] for w in frames]
    single = np.nanstd(images[0])
    mean, error = stack_weighted(images, variances)
    assert np.nanstd(mean) == pytest.approx(single / 3.0, rel=0.15)
    assert np.nanmedian(error) == pytest.approx(0.5 / 3.0, rel=0.15)


def test_weights_follow_the_inverse_variance():
    clean = np.full((8, 8), 10.0)
    noisy = np.full((8, 8), 20.0)
    mean, error = stack_weighted([clean, noisy], [np.full((8, 8), 1.0), np.full((8, 8), 9.0)])
    assert mean[0, 0] == pytest.approx((10 / 1 + 20 / 9) / (1 + 1 / 9))
    assert error[0, 0] == pytest.approx(1 / np.sqrt(1 + 1 / 9))


def test_masked_pixels_do_not_enter_the_stack():
    a = np.full((4, 4), 5.0)
    b = np.full((4, 4), 100.0)
    b[0, 0] = np.nan
    mean, _ = stack_weighted([a, b], [np.ones((4, 4)), np.ones((4, 4))])
    assert mean[0, 0] == pytest.approx(5.0)
    assert mean[1, 1] == pytest.approx(52.5)


def test_following_the_proper_motion_sharpens_a_moving_source():
    pm_ra = -6150.0 / 30 * 365.25
    sources = [[(RA0 - k * SCALE_DEG / np.cos(np.deg2rad(DEC0)), DEC0, 6.0)] for k in range(6)]
    frames = warped(sources, noise=0.4)
    images = [w["image"] for w in frames]
    variances = [w["variance"] for w in frames]
    mjds = [w["mjd"] for w in frames]
    plain, _ = stack_weighted(images, variances)
    shifts = motion_shifts(mjds, pm_ra_mas_yr=pm_ra, pm_dec_mas_yr=0.0, ref_mjd=mjds[0])
    followed, _ = stack_weighted(images, variances, shifts)
    assert np.nanmax(followed) > 1.8 * np.nanmax(plain)


def residual_peak(match_psf):
    flux_peak_sharp = 150.0
    ratio = (3.0 / 2.0) ** 2
    a = synthetic.make_fits([(RA0, DEC0, flux_peak_sharp * ratio)], shape=(40, 40), fwhm_pix=2.0,
                            noise=0.3, seed=1, mjd=60800.0)
    b = synthetic.make_fits([(RA0, DEC0, flux_peak_sharp)], shape=(40, 40), fwhm_pix=3.0,
                            noise=0.3, seed=2, mjd=60900.0)
    result = TemporalAnalysisEngine().compare(
        a, b, {"detector": 6}, {"detector": 6}, ra_deg=RA0, dec_deg=DEC0, match_psf=match_psf
    )
    return result


def test_psf_matching_removes_the_residual_around_a_bright_static_source():
    unmatched = residual_peak(False)
    matched = residual_peak(True)
    assert unmatched["detections"], "control: different PSFs must leave a residual"
    assert matched["detections"] == []
    assert any("PSFs matched" in lim for lim in matched["limitations"])
