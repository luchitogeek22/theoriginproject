"""WP-23: aperture photometry and relative light curves on synthetic frames with known truth."""

import pathlib
import sys

import numpy as np
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import synthetic  # noqa: E402

from app.services.photometry import (  # noqa: E402
    PIXEL_SOLID_ANGLE_SR,
    aperture_photometry,
    relative_lightcurve,
    select_comparisons,
)
from app.services.spherex_product import read_product  # noqa: E402

RA0, DEC0 = 150.0, 2.0
SCALE = 6.15 / 3600.0
COMPARISON_OFFSETS = [(12, 0), (-12, 0), (0, 12), (0, -12), (14, 14)]


def sky(dx, dy):
    return RA0 - dx * SCALE / np.cos(np.deg2rad(DEC0)), DEC0 + dy * SCALE


TARGET = sky(0, 0)
COMPARISONS = [sky(dx, dy) for dx, dy in COMPARISON_OFFSETS]


def series(target_factor, common_factor=None, zodi=None, flags_at=None, n=16):
    products = []
    for k in range(n):
        common = common_factor[k] if common_factor is not None else 1.0
        sources = [(*TARGET, 20.0 * target_factor[k] * common)]
        sources += [(*pos, 20.0 * common) for pos in COMPARISONS]
        flags = None
        if flags_at is not None and k in flags_at:
            flags = np.zeros((64, 64), dtype=np.int32)
            flags[30:34, 30:34] = 1
        data = synthetic.make_fits(
            sources, shape=(64, 64), noise=0.2, seed=k, mjd=60800.0 + 20 * k,
            zodi=zodi[k] if zodi is not None else 0.0, flags=flags,
        )
        products.append(read_product(data))
    return products


def curve(products, with_comparisons=True):
    target = [aperture_photometry(p, *TARGET) for p in products]
    comps = [[aperture_photometry(p, *pos) for p in products] for pos in COMPARISONS]
    mjds = [p.mjd_obs for p in products]
    return relative_lightcurve(mjds, target, comps if with_comparisons else []), target


def values(result):
    return np.array([p["value"] for p in result["points"] if p["used"]])


def test_an_injected_30_percent_variable_is_recovered():
    k = np.arange(16)
    factor = 1 + 0.3 * np.sin(2 * np.pi * k / 8)
    result, _ = curve(series(factor))
    v = values(result)
    amplitude = (v.max() - v.min()) / 2 / np.median(v)
    assert amplitude == pytest.approx(0.3, abs=0.04)
    assert result["relative"] is True


def test_a_common_20_percent_change_cancels_in_the_relative_curve():
    common = 1 + 0.2 * np.sin(np.linspace(0, 6, 16))
    result, target = curve(series(np.ones(16), common_factor=common))
    raw = np.array([t["flux"] for t in target])
    assert raw.std() / raw.mean() > 0.08
    assert values(result).std() < 0.02


def test_variable_zodiacal_light_does_not_leak_into_the_flux():
    zodi = np.linspace(0.0, 3.0, 16)
    result, target = curve(series(np.ones(16), zodi=zodi), with_comparisons=False)
    flux = np.array([t["flux"] for t in target])
    assert flux.std() / flux.mean() < 0.03


def test_a_flagged_pixel_in_the_aperture_marks_and_excludes_the_point():
    result, target = curve(series(np.ones(16), flags_at=[3]))
    assert target[3]["flagged"] is True
    point = result["points"][3]
    assert point["flagged"] is True and point["used"] is False
    assert sum(p["used"] for p in result["points"]) == 15


def test_without_comparison_stars_the_curve_is_absolute_and_says_so():
    result, _ = curve(series(np.ones(16)), with_comparisons=False)
    assert result["relative"] is False
    assert "absolute" in result["label"]
    assert result["n_comparisons"] == 0


def test_photometry_outside_the_cutout_is_reported_not_invented():
    product = series(np.ones(1), n=1)[0]
    far = aperture_photometry(product, RA0 + 1.0, DEC0)
    assert far["ok"] is False


def test_comparison_selection_prefers_unflagged_bright_matches():
    candidates = [
        {"ok": True, "flagged": False, "snr": 50, "flux": 100.0},
        {"ok": True, "flagged": True, "snr": 50, "flux": 90.0},
        {"ok": True, "flagged": False, "snr": 5, "flux": 95.0},
        {"ok": True, "flagged": False, "snr": 40, "flux": 30.0},
        {"ok": False},
    ]
    chosen = select_comparisons(candidates, target_flux=95.0, n_max=10, n_min=1)
    assert [c["flux"] for c in chosen] == [100.0, 30.0]


def test_a_comparison_star_flagged_at_one_epoch_does_not_create_variability():
    mjds = list(range(8))

    def points(flux, flagged_at=None):
        return [
            {"ok": True, "flagged": i == flagged_at, "flux": flux, "flux_err": 0.5}
            for i in range(8)
        ]

    target = points(80.0)
    comparisons = [points(50.0), points(100.0), points(200.0, flagged_at=3)]
    result = relative_lightcurve(mjds, target, comparisons)
    values = [p["value"] for p in result["points"] if p["used"]]
    assert max(values) - min(values) < 0.01


def test_a_target_flagged_in_most_frames_gets_a_detector_hint():
    from app.services.sequence import FrameInput
    from app.services.sequence_extras import build_lightcurve

    kept = []
    for k in range(4):
        flags = np.zeros((64, 64), dtype=np.int32)
        flags[30:34, 30:34] = 1
        data = synthetic.make_fits(
            [(*TARGET, 20.0)], shape=(64, 64), noise=0.2, seed=k, mjd=60800.0 + 20 * k, flags=flags
        )
        kept.append((FrameInput({"obs_id": f"o{k}"}, data), read_product(data)))
    params = {"ra_deg": TARGET[0], "dec_deg": TARGET[1], "size_arcmin": 6.0}
    curve = build_lightcurve(kept, params, gaia_fn=lambda *a, **k: [])
    assert curve["target_flagged_fraction"] == 1.0
    assert any("try another detector" in note for note in curve["limitations"])


def saturated_series(amplitudes, holes):
    products = []
    for k, amp in enumerate(amplitudes):
        flags = np.zeros((64, 64), dtype=np.int32)
        yy, xx = np.mgrid[:64, :64]
        radius = np.hypot(xx - 31.5, yy - 31.5)
        flags[radius <= 3.5] = 1
        if holes[k]:
            flags[(radius > 3.5) & (radius < 9) & (xx > 31.5)] = 1
        data = synthetic.make_fits(
            [(*TARGET, 3000.0 * amp)], shape=(64, 64), noise=0.3, seed=k, mjd=60800.0 + 20 * k,
            flags=flags, halo_fraction=0.02,
        )
        products.append(read_product(data))
    return products


def test_psf_wing_photometry_recovers_variability_of_a_saturated_star():
    from app.services.photometry import wing_amplitudes

    k = np.arange(14)
    amplitudes = 1 + 0.3 * np.sin(2 * np.pi * k / 7)
    products = saturated_series(amplitudes, holes=[i % 3 == 0 for i in k])
    results = wing_amplitudes(products, [TARGET] * 14)
    values = np.array([r["flux"] for r in results])
    assert all(r["ok"] for r in results)
    relative = values / np.median(values)
    assert relative.max() - relative.min() == pytest.approx(
        amplitudes.max() - amplitudes.min(), rel=0.15
    )
    assert np.corrcoef(relative, amplitudes)[0, 1] > 0.98


def test_changing_masks_do_not_create_variability_in_a_constant_saturated_star():
    from app.services.photometry import wing_amplitudes

    products = saturated_series(np.ones(12), holes=[i % 2 == 0 for i in range(12)])
    values = np.array([r["flux"] for r in wing_amplitudes(products, [TARGET] * 12)])
    assert values.std() / values.mean() < 0.03


def test_the_lightcurve_switches_to_psf_wings_when_the_core_is_flagged():
    from app.services.sequence import FrameInput
    from app.services.sequence_extras import build_lightcurve

    products = saturated_series(1 + 0.3 * np.sin(np.arange(8)), holes=[False] * 8)
    kept = [(FrameInput({"obs_id": f"s{i}"}, b""), p) for i, p in enumerate(products)]
    params = {"ra_deg": TARGET[0], "dec_deg": TARGET[1], "size_arcmin": 6.0}
    curve = build_lightcurve(kept, params, gaia_fn=lambda *a, **k: [])
    assert curve["method"] == "psf_wings"
    assert sum(p["used"] for p in curve["points"]) >= 7
    assert any("PSF" in note and "wings" in note for note in curve["limitations"])


# --- ePSF aperture correction (IRSA notebook "spherex-psf", DR1 / pipeline v7+) ---------------

def gaussian_stamp(sigma_native, oversample=5, size=33, halo=0.0):
    c = (size - 1) / 2
    yy, xx = np.mgrid[:size, :size]
    r2 = ((xx - c) ** 2 + (yy - c) ** 2) / oversample**2
    stamp = np.exp(-r2 / (2 * sigma_native**2)) + halo * (1.0 + r2 / 4.0) ** -1.5
    return stamp / stamp.sum()


def encircled(stamp, radius, oversample=5):
    c = (stamp.shape[0] - 1) / 2
    yy, xx = np.mgrid[: stamp.shape[0], : stamp.shape[1]]
    return float(stamp[np.hypot(xx - c, yy - c) / oversample <= radius].sum() / stamp.sum())


def test_the_epsf_of_the_nearest_zone_corrects_the_aperture_flux():
    wide = gaussian_stamp(0.85, halo=0.08)
    sharp = gaussian_stamp(0.85)
    # Target at cutout pixel ~(31.5, 31.5) -> parent (1 + 31.5 + 300, 1 + 31.5 + 100) = (332.5, 132.5).
    zones = [(330.0, 130.0, 3, 1, wide), (900.0, 900.0, 9, 9, sharp)]
    data = synthetic.make_fits([(*TARGET, 20.0)], shape=(64, 64), noise=0.05, seed=1, epsf_zones=zones)
    product = read_product(data)
    result = aperture_photometry(product, *TARGET)

    assert result["psf_model"] == "epsf"
    assert result["psf_zone"] == [3, 1]
    expected = encircled(wide, result["radius_pix"])
    assert result["encircled_energy"] == pytest.approx(expected, rel=1e-6)
    assert result["aperture_correction"] == pytest.approx(1.0 / expected, rel=1e-6)
    assert result["flux"] == pytest.approx(result["flux_uncorrected"] / expected, rel=1e-9)
    assert result["flux_err"] == pytest.approx(result["flux_err_uncorrected"] / expected, rel=1e-9)
    assert result["flux_jy"] == pytest.approx(result["flux"] * PIXEL_SOLID_ANGLE_SR * 1e6, rel=1e-9)


def test_products_without_an_epsf_keep_the_uncorrected_flux():
    product = read_product(synthetic.make_fits([(*TARGET, 20.0)], shape=(64, 64), noise=0.05, seed=1))
    result = aperture_photometry(product, *TARGET)
    assert result["psf_model"] == "none"
    assert result["aperture_correction"] == 1.0
    assert result["psf_zone"] is None
    assert result["flux"] == result["flux_uncorrected"]


def test_the_lightcurve_says_how_many_frames_got_the_epsf_correction():
    from app.services.sequence import FrameInput
    from app.services.sequence_extras import build_lightcurve

    stamp = gaussian_stamp(0.85)
    kept = []
    for k in range(4):
        zones = [(330.0, 130.0, 3, 1, stamp)] if k < 3 else None
        data = synthetic.make_fits([(*TARGET, 20.0)], shape=(64, 64), noise=0.1, seed=k,
                                   mjd=60800.0 + 20 * k, epsf_zones=zones)
        kept.append((FrameInput({"obs_id": f"e{k}"}, data), read_product(data)))
    params = {"ra_deg": TARGET[0], "dec_deg": TARGET[1], "size_arcmin": 6.0}
    curve = build_lightcurve(kept, params, gaia_fn=lambda *a, **k: [])
    assert "One curve per detector; detectors are never mixed. Aperture flux corrected with the SPHEREx ePSF in 3 of 4 frames." in curve["limitations"]
    assert curve["aperture_correction"] == {"model": "epsf", "frames": 3, "total": 4}


def test_the_comparison_note_counts_the_stars_that_passed_the_cut():
    import re

    from app.services.sequence import FrameInput
    from app.services.sequence_extras import build_lightcurve

    bright, faint, empty = COMPARISONS[0], COMPARISONS[1], COMPARISONS[2]
    kept = []
    for k in range(3):
        data = synthetic.make_fits(
            [(*TARGET, 20.0), (*bright, 40.0), (*faint, 0.5)], shape=(64, 64), noise=0.2, seed=k,
            mjd=60800.0 + 20 * k,
        )
        kept.append((FrameInput({"obs_id": f"o{k}"}, data), read_product(data)))
    stars = [
        {"source_id": i, "ra": ra, "dec": dec, "pmra": 0.0, "pmdec": 0.0, "parallax": None,
         "g_mag": 14.0, "variable": False}
        for i, (ra, dec) in enumerate((bright, faint, empty))
    ]
    params = {"ra_deg": TARGET[0], "dec_deg": TARGET[1], "size_arcmin": 6.0}
    curve = build_lightcurve(kept, params, gaia_fn=lambda *a, **k: stars)
    note = next(n for n in curve["limitations"] if n.startswith("Only "))
    assert re.match(r"^Only (\d+) Gaia star\(s\) were measurable here.*$", note)
    assert note.startswith("Only 1 Gaia star(s) were measurable here")
    assert "3 candidate" in note
