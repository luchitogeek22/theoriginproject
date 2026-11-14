"""WP-24: trajectories and Gaia overlay on the sequence grid (Gaia simulated)."""

import pathlib
import sys

import numpy as np
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import synthetic  # noqa: E402

from app.services.catalogs import CatalogUnavailable, gaia_position_at  # noqa: E402
from app.services.sequence import FrameInput, common_grid  # noqa: E402
from app.services.sequence_extras import build_overlay, target_track  # noqa: E402
from app.services.spherex_product import read_product  # noqa: E402

RA0, DEC0 = 150.0, 2.0
SCALE = 6.15 / 3600.0


def kept_for(mjds, sources=()):
    out = []
    for k, mjd in enumerate(mjds):
        data = synthetic.make_fits(list(sources), shape=(64, 64), noise=0.1, seed=k, mjd=mjd)
        out.append((FrameInput({"obs_id": f"o{k}"}, data), read_product(data)))
    return out


def star(source_id=1, ra=RA0, dec=DEC0, pmra=0.0, pmdec=0.0):
    return {"source_id": source_id, "ra": ra, "dec": dec, "pmra": pmra, "pmdec": pmdec,
            "parallax": None, "g_mag": 14.0, "variable": False}


def test_a_10000_mas_per_year_star_is_100_arcsec_further_north_ten_years_later():
    from astropy.time import Time

    ra, dec = gaia_position_at(star(pmdec=10000.0), Time("J2026.0").mjd)
    ra0, dec0 = gaia_position_at(star(pmdec=10000.0), Time("J2016.0").mjd)
    assert abs((dec - dec0) * 3600 - 100.0) < 0.1
    assert abs((ra - ra0) * 3600) < 0.1


def test_gaia_marks_coincide_with_injected_sources_within_a_pixel():
    sources = [(RA0 + 5 * SCALE, DEC0 + 3 * SCALE, 30.0)]
    kept = kept_for([60800.0, 60900.0], sources)
    grid, n = common_grid(RA0, DEC0, 6.0)
    catalog_star = star(ra=sources[0][0], dec=sources[0][1])
    params = {"ra_deg": RA0, "dec_deg": DEC0, "size_arcmin": 6.0}
    overlay = build_overlay(kept, grid, n, params, gaia_fn=lambda *a, **k: [catalog_star])
    mark = overlay["gaia"][0]["positions"][0]
    x, y = grid.all_world2pix([[sources[0][0], sources[0][1]]], 0)[0]
    assert abs(mark["x"] - x) < 1 and abs(mark["y"] - (n - 1 - y)) < 1
    first = kept[0][1]
    image_x, image_y = first.pixel_of(*sources[0][:2])
    assert abs(image_x - np.unravel_index(np.argmax(first.image), first.image.shape)[1]) < 1.5


def test_the_overlay_survives_gaia_being_unreachable():
    def down(*a, **k):
        raise CatalogUnavailable("down")

    kept = kept_for([60800.0, 60900.0])
    grid, n = common_grid(RA0, DEC0, 6.0)
    overlay = build_overlay(kept, grid, n, {"ra_deg": RA0, "dec_deg": DEC0, "size_arcmin": 6.0}, gaia_fn=down)
    assert overlay["gaia_available"] is False and overlay["gaia"] == []
    assert overlay["target"]


def test_the_target_trajectory_and_field_recommendation_for_a_fast_mover():
    kept = kept_for([60800.0, 61200.0])
    grid, n = common_grid(RA0, DEC0, 1.0)
    params = {"ra_deg": RA0, "dec_deg": DEC0, "size_arcmin": 1.0,
              "pm_ra_mas_yr": 0.0, "pm_dec_mas_yr": 40000.0, "ref_epoch": "2025-05-01T00:00:00"}
    overlay = build_overlay(kept, grid, n, params, gaia_fn=lambda *a, **k: [])
    assert overlay["proper_motion_applied"] is True
    assert overlay["displacement_arcsec"] == pytest.approx(43.8, rel=0.05)
    assert overlay["fov_hint"] and "larger field" in overlay["fov_hint"]


def test_known_targets_get_their_catalog_motion_without_the_client_sending_it():
    track, moved = target_track(
        {"ra_deg": 133.81890825, "dec_deg": -7.247048}, [60800.0, 61000.0]
    )
    assert moved is True
    assert abs(track[1][0] - track[0][0]) * 3600 > 3.5
    free, moved_free = target_track({"ra_deg": 10.0, "dec_deg": 10.0}, [60800.0, 61000.0])
    assert moved_free is False and free[0] == free[1]


ROWS = [{"source_id": 7, "ra": 10.0, "dec": 20.0, "pmra": 0.0, "pmdec": 0.0, "parallax": None,
         "g_mag": 12.0, "variable": False}]


def _forget_memory_cache():
    from app.services import store

    store._memory_cache.clear()


def test_a_gaia_field_that_answered_once_survives_a_later_429(monkeypatch):
    from app.services import catalogs

    calls = []

    def answer(*args):
        calls.append(args)
        return ROWS

    monkeypatch.setattr(catalogs, "_gaia_query", answer)
    assert catalogs.gaia_cone(10.0, 20.0, 0.075, 17.5, 300) == ROWS
    assert catalogs.gaia_cone(10.0, 20.0, 0.075, 17.5, 300) == ROWS
    assert len(calls) == 1

    def too_many_requests(*args):
        raise RuntimeError("HTTP Error 429: Too Many Requests")

    _forget_memory_cache()
    monkeypatch.setattr(catalogs, "_gaia_query", too_many_requests)
    assert catalogs.gaia_cone(10.0, 20.0, 0.075, 17.5, 300) == ROWS


def test_a_gaia_field_never_answered_still_reports_unavailable(monkeypatch):
    from app.services import catalogs

    def too_many_requests(*args):
        raise RuntimeError("HTTP Error 429: Too Many Requests")

    _forget_memory_cache()
    monkeypatch.setattr(catalogs, "_gaia_query", too_many_requests)
    with pytest.raises(CatalogUnavailable):
        catalogs.gaia_cone(11.0, 21.0, 0.075, 17.5, 300)


def test_gaia_fields_are_cached_for_a_long_time(monkeypatch):
    from app.config import get_settings
    from app.services import catalogs

    ttls = []
    monkeypatch.setattr(catalogs, "_gaia_query", lambda *a: ROWS)
    monkeypatch.setattr(catalogs, "cache_set_json", lambda key, value, ttl: ttls.append(ttl))
    catalogs.gaia_cone(12.0, 22.0, 0.075, 17.5, 300)
    assert ttls == [get_settings().gaia_cache_ttl_seconds]
    assert get_settings().gaia_cache_ttl_seconds >= 30 * 86400
