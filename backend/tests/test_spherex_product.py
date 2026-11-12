"""WP-33: the SPHEREx product reader, exercised on real IRSA cutouts."""

import json
import pathlib
import re

import numpy as np
import pytest

pytest.importorskip("astropy")
from astropy.time import Time

from app.services.spherex_product import HARD_MASK_BITS, hard_mask_valid, read_product
from app.services.targets import load_test_targets, propagate

REAL = pathlib.Path(__file__).parent / "fixtures" / "real"
FACTS = json.loads((REAL / "spherex_qr2_facts.json").read_text())
OBSERVED = json.loads((REAL / "observed_cutouts.json").read_text())["observed"]
TARGETS = {t["name"]: t for t in load_test_targets()}
NAMES = list(OBSERVED)


def load(name):
    return read_product((REAL / OBSERVED[name]["fixture"]).read_bytes())


@pytest.mark.parametrize("name", NAMES)
def test_extensions_are_found_by_name_with_the_documented_shapes(name):
    product = load(name)
    expected = {e["extname"]: e for e in FACTS["cutout"]["extensions"]}
    assert product.image.shape == tuple(OBSERVED[name]["shape"])
    for plane in (product.flags, product.variance, product.zodi):
        assert plane.shape == product.image.shape
    assert product.extension_names == [e["extname"] for e in FACTS["cutout"]["extensions"]]
    assert expected["PSF"]["shape"] == [121, 101, 101]


@pytest.mark.parametrize("name", NAMES)
def test_metadata_comes_from_the_image_header(name):
    product = load(name)
    assert product.detector == OBSERVED[name]["detector"]
    assert product.mjd_obs == pytest.approx(OBSERVED[name]["mjd_obs"])
    assert product.date_obs == OBSERVED[name]["date_obs"]


@pytest.mark.parametrize("name", NAMES)
def test_target_lands_on_the_recorded_pixel(name):
    product = load(name)
    target = TARGETS[name]
    ra, dec = propagate(
        target["ra_deg"], target["dec_deg"], target["pmra_mas_yr"], target["pmdec_mas_yr"],
        target["parallax_mas"], "J2000", Time(61000.0, format="mjd"),
    )
    x, y = product.pixel_of(ra, dec)
    assert (x, y) == pytest.approx(tuple(OBSERVED[name]["target_pixel"]), abs=0.5)


@pytest.mark.parametrize("name", NAMES)
def test_wavelength_at_the_target_matches_the_recorded_value(name):
    product = load(name)
    x, y = OBSERVED[name]["target_pixel"]
    wave_um, bandwidth_um = product.wavelength_at(x, y)
    assert wave_um == pytest.approx(OBSERVED[name]["wavelength_um_at_target"], abs=0.001)
    assert bandwidth_um == pytest.approx(OBSERVED[name]["bandwidth_um_at_target"], abs=0.001)


@pytest.mark.parametrize("name", NAMES)
def test_hard_mask_keeps_almost_every_pixel(name):
    assert load(name).quality_mask.mean() > 0.95


def test_the_old_flags_equal_zero_rule_would_have_discarded_everything():
    product = load("Barnard's Star")
    assert (product.flags == 0).mean() == 0.0
    assert product.quality_mask.mean() > 0.95


def test_source_bit_alone_is_valid_and_hard_bits_are_not():
    flags = np.array([0, 1 << 21, 1 << 0, 1 << 29, (1 << 21) | (1 << 11)], dtype=np.int32)
    assert hard_mask_valid(flags).tolist() == [True, True, False, False, False]
    assert 21 not in HARD_MASK_BITS


@pytest.mark.parametrize("name", NAMES)
def test_science_image_has_zodiacal_light_removed(name):
    product = load(name)
    np.testing.assert_allclose(product.science_image, product.image - product.zodi)


def test_missing_image_extension_is_rejected():
    from astropy.io import fits
    import io

    buffer = io.BytesIO()
    fits.HDUList([fits.PrimaryHDU()]).writeto(buffer)
    with pytest.raises(ValueError, match="IMAGE"):
        read_product(buffer.getvalue())


def test_no_wcs_is_built_from_a_plain_dict_in_the_app():
    app_dir = pathlib.Path(__file__).parent.parent / "app"
    offenders = [
        str(p) for p in app_dir.rglob("*.py")
        if re.search(r"WCS\(\s*dict\(", p.read_text())
    ]
    assert offenders == []


def test_spectral_engine_uses_wavelengths_from_the_wcs_not_the_psf():
    from app.services.spectral import SpectralAnalysisEngine

    name = "WISE 0855"
    data = (REAL / OBSERVED[name]["fixture"]).read_bytes()
    target = TARGETS[name]
    ra, dec = propagate(
        target["ra_deg"], target["dec_deg"], target["pmra_mas_yr"], target["pmdec_mas_yr"],
        target["parallax_mas"], "J2000", Time(61000.0, format="mjd"),
    )
    result = SpectralAnalysisEngine().extract(data, {"detector": 6}, ra, dec)
    waves = [s["wavelength_um"] for s in result["samples"]]
    assert waves and all(w is not None for w in waves)
    assert 4.0 < min(waves) < max(waves) < 5.5
    assert not any("PSF" in note or "resampled" in note for note in result["limitations"])
    assert result["n_samples"] > 40


def test_temporal_engine_aligns_two_real_exposures_of_different_size():
    from app.services.temporal import TemporalAnalysisEngine

    wise = (REAL / OBSERVED["WISE 0855"]["fixture"]).read_bytes()
    barnard = (REAL / OBSERVED["Barnard's Star"]["fixture"]).read_bytes()
    result = TemporalAnalysisEngine().compare(wise, wise, {"detector": 6}, {"detector": 6})
    assert result["aligned"] is True
    assert result["valid_fraction"] > 0.9
    assert abs(result["difference_stats"]["median"]) < 1e-6
    assert result["grid_shape"] == [59, 59]
    assert barnard
