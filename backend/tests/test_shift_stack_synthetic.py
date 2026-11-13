"""WP-25: shift-and-stack search on synthetic visits with known truth."""

import pathlib
import sys

import numpy as np
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import synthetic  # noqa: E402

from app.services.sequence import FrameInput, common_grid, reproject_frames  # noqa: E402
from app.services.shift_stack import corrected_sigma, search  # noqa: E402
from app.services.spherex_product import read_product  # noqa: E402

RA0, DEC0 = 150.0, 2.0
SCALE = 6.15 / 3600.0
INTERVAL_DAYS = 30.0
PX_PER_YEAR = 6.15 * 365.25 / INTERVAL_DAYS
PSF_SIGMA = 0.85


def visits(n, sources_for, noise=0.5, seed0=0):
    kept = []
    for k in range(n):
        data = synthetic.make_fits(
            sources_for(k), shape=(40, 40), noise=noise, seed=seed0 + k, mjd=60800.0 + INTERVAL_DAYS * k
        )
        kept.append((FrameInput({"obs_id": f"v{k}"}, data), read_product(data)))
    grid, size = common_grid(RA0, DEC0, 3.9)
    warped = reproject_frames(kept, grid, size, RA0, DEC0)
    return [w["image"] for w in warped], [w["variance"] for w in warped], [w["mjd"] for w in warped]


def mover(k, px_per_visit=1.0, peak=1.0, x0=-3.0, y0=0.0):
    return [(RA0 - (x0 + px_per_visit * k) * SCALE / np.cos(np.deg2rad(DEC0)), DEC0 + y0 * SCALE, peak)]


def run(images, variances, mjds, **kw):
    kw.setdefault("max_speed_arcsec_yr", 2.0 * PX_PER_YEAR)
    kw.setdefault("steps", 9)
    kw.setdefault("psf_sigma_pix", PSF_SIGMA)
    return search(images, variances, mjds, **kw)


def test_a_faint_mover_is_recovered_with_its_velocity():
    images, variances, mjds = visits(8, lambda k: mover(k, 1.0, peak=1.0), noise=0.5)
    result = run(images, variances, mjds)
    best = result["best"]
    tolerance = 0.5 * PX_PER_YEAR
    assert best["v_east_arcsec_yr"] == pytest.approx(-PX_PER_YEAR, abs=tolerance)
    assert abs(best["v_north_arcsec_yr"]) <= tolerance
    assert best["sigma_corrected"] >= 5.0


@pytest.mark.slow
def test_pure_noise_is_rarely_flagged():
    rng = np.random.default_rng(7)
    mjds = [60800.0 + INTERVAL_DAYS * k for k in range(5)]
    flagged = 0
    for _ in range(200):
        images = [rng.normal(0.0, 0.5, (40, 40)) for _ in mjds]
        variances = [np.full((40, 40), 0.25) for _ in mjds]
        flagged += bool(run(images, variances, mjds, steps=5)["best"]["detected"])
    assert flagged / 200 <= 0.02


def test_a_bright_static_star_does_not_create_a_moving_peak():
    star = [(RA0, DEC0, 400.0)]
    images, variances, mjds = visits(8, lambda k: star, noise=0.5)
    result = run(images, variances, mjds)
    assert result["best"]["detected"] is False


def test_fewer_than_three_visits_gives_an_explicit_limitation_and_no_result():
    images, variances, mjds = visits(2, lambda k: mover(k), noise=0.5)
    result = run(images, variances, mjds)
    assert result["ok"] is False
    assert any("visits" in lim for lim in result["limitations"])


def test_the_trials_penalty_lowers_the_significance():
    assert corrected_sigma(5.0, 1)[0] == pytest.approx(5.0, abs=1e-6)
    assert corrected_sigma(5.0, 1_000_000)[0] < 4.0


def test_a_constant_bright_star_with_flux_scatter_is_not_a_mover():
    rng = np.random.default_rng(3)
    detected = 0
    for seed in range(10):
        scatter = 1 + 0.01 * rng.normal(size=8)
        images, variances, mjds = visits(
            8, lambda k: [(RA0, DEC0, 100.0 * scatter[k])], noise=0.5, seed0=3000 + 10 * seed
        )
        detected += bool(run(images, variances, mjds)["best"]["detected"])
    assert detected == 0


def test_a_northward_mover_is_recovered_with_the_right_sign():
    def north(k):
        return [(RA0, DEC0 + (-3.0 + k) * SCALE, 1.0)]

    images, variances, mjds = visits(8, north, noise=0.5)
    best = run(images, variances, mjds)["best"]
    assert best["v_north_arcsec_yr"] == pytest.approx(PX_PER_YEAR, abs=0.1)
    assert best["v_east_arcsec_yr"] == pytest.approx(0.0, abs=0.1)


def test_static_velocities_are_not_searched():
    images, variances, mjds = visits(5, lambda k: [], noise=0.5)
    result = run(images, variances, mjds)
    centre = len(result["velocity_axis_arcsec_yr"]) // 2
    assert result["significance_map"][centre][centre] is None
    assert any("not searched" in lim for lim in result["limitations"])


def test_the_corrected_sigma_is_capped():
    assert corrected_sigma(60.0, 10)[0] <= 40.0


def test_static_stars_whose_flux_changes_a_lot_between_visits_are_not_movers():
    rng = np.random.default_rng(11)
    detected = 0
    for seed in range(8):
        gains = 1 + 0.3 * rng.normal(size=8)
        images, variances, mjds = visits(
            8, lambda k: [(RA0, DEC0, 60.0 * gains[k]), (RA0 + 12 * SCALE, DEC0 + 5 * SCALE, 40.0 * gains[7 - k])],
            noise=0.5, seed0=5000 + 10 * seed,
        )
        detected += bool(run(images, variances, mjds)["best"]["detected"])
    assert detected == 0


def test_a_best_velocity_at_the_edge_of_the_range_is_never_a_detection():
    images, variances, mjds = visits(8, lambda k: mover(k, 3.0, peak=1.5, x0=-8.0), noise=0.4)
    best = run(images, variances, mjds, max_speed_arcsec_yr=1.5 * PX_PER_YEAR)["best"]
    assert best["at_grid_edge"] is True and best["detected"] is False


from app.services.shift_stack import targeted_check  # noqa: E402

CENTRE = (19.0, 19.0)
SLOW_PM_RA = -(1.3 * 6.15 * 1000) / (7 * INTERVAL_DAYS / 365.25)


def slow_mover_sources(k):
    offset_px = (-0.65 + 1.3 * k / 7)
    return [(RA0 - offset_px * SCALE / np.cos(np.deg2rad(DEC0)), DEC0, 1.2)]


def test_a_known_slow_mover_is_confirmed_at_its_predicted_position():
    images, variances, mjds = visits(8, slow_mover_sources, noise=0.5)
    result = targeted_check(
        images, variances, mjds, SLOW_PM_RA, 0.0, CENTRE, psf_sigma_pix=PSF_SIGMA, seed=1
    )
    assert result["ok"] is True
    assert result["p_value"] <= 0.02
    assert result["offset_px"] <= 1.5
    assert result["predicted_motion_px"] == pytest.approx(1.3, abs=0.2)


def test_the_blind_search_never_reports_a_velocity_below_the_static_limit():
    images, variances, mjds = visits(8, slow_mover_sources, noise=0.5)
    result = run(images, variances, mjds)
    window_years = (mjds[-1] - mjds[0]) / 365.25
    floor = 1.5 * 6.15 / window_years
    best = result["best"]
    assert np.hypot(best["v_east_arcsec_yr"], best["v_north_arcsec_yr"]) >= floor - 1e-6
    assert any("not searched" in lim for lim in result["limitations"])


def test_the_targeted_check_is_calibrated_on_noise():
    rng = np.random.default_rng(21)
    mjds = [60800.0 + INTERVAL_DAYS * k for k in range(8)]
    significant = 0
    for seed in range(40):
        images = [rng.normal(0.0, 0.5, (38, 38)) for _ in mjds]
        variances = [np.full((38, 38), 0.25) for _ in mjds]
        result = targeted_check(images, variances, mjds, SLOW_PM_RA, 0.0, CENTRE, psf_sigma_pix=PSF_SIGMA, seed=seed)
        significant += bool(result["ok"] and result["p_value"] <= 0.05)
    assert significant / 40 <= 0.15


def test_the_targeted_check_needs_three_visits():
    images, variances, mjds = visits(2, slow_mover_sources, noise=0.5)
    assert targeted_check(images, variances, mjds, SLOW_PM_RA, 0.0, CENTRE)["ok"] is False


from app.services.shift_stack import measure_motion  # noqa: E402


def fast_mover_sources(k, total_px=3.0, peak=8.0):
    offset = -total_px / 2 + total_px * k / 7
    return [(RA0 - offset * SCALE / np.cos(np.deg2rad(DEC0)), DEC0, peak)]


PM_3PX = -(3.0 * 6.15 * 1000) / (7 * INTERVAL_DAYS / 365.25)


def test_measured_motion_matches_the_injected_displacement():
    images, variances, mjds = visits(8, fast_mover_sources, noise=0.4)
    result = measure_motion(images, variances, mjds, PM_3PX, 0.0, CENTRE, psf_sigma_pix=PSF_SIGMA)
    assert result["measurable"] is True
    assert result["difference_arcsec"] < 0.3 * 6.15
    assert result["measured_arcsec"] == pytest.approx(result["predicted_arcsec"], abs=0.3 * 6.15)
    assert result["measured_east_arcsec"] * result["predicted_east_arcsec"] > 0


def test_a_target_that_does_not_move_measures_no_displacement_when_none_is_predicted():
    images, variances, mjds = visits(8, lambda k: [(RA0, DEC0, 8.0)], noise=0.4)
    result = measure_motion(images, variances, mjds, 0.0, 0.0, CENTRE, psf_sigma_pix=PSF_SIGMA)
    assert result["measurable"] is True
    assert result["measured_arcsec"] < 0.3 * 6.15


def test_a_wrong_catalogue_motion_shows_up_as_a_difference():
    images, variances, mjds = visits(8, lambda k: [(RA0, DEC0, 8.0)], noise=0.4)
    result = measure_motion(images, variances, mjds, PM_3PX, 0.0, CENTRE, psf_sigma_pix=PSF_SIGMA)
    assert result["measurable"] is True
    assert result["difference_arcsec"] > 1.0 * 6.15


def test_a_faint_target_is_reported_as_not_measurable():
    images, variances, mjds = visits(8, lambda k: [], noise=0.5)
    result = measure_motion(images, variances, mjds, PM_3PX, 0.0, CENTRE, psf_sigma_pix=PSF_SIGMA)
    assert result["measurable"] is False and result["reason"]


def test_measuring_motion_needs_four_visits():
    images, variances, mjds = visits(3, lambda k: [(RA0, DEC0, 8.0)], noise=0.4)
    assert measure_motion(images, variances, mjds, PM_3PX, 0.0, CENTRE)["measurable"] is False
