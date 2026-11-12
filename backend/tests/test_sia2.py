"""SIA2 parameter builder: documented protocol shape, no network."""

import pytest

httpx = pytest.importorskip("httpx")

from app.services.sia2_gateway import build_sia2_params, normalize_row, query_hash


def test_build_sia2_params_basic():
    params = build_sia2_params(133.795129, -7.245147, 0.1667, "spherex_qr3", 200)
    assert params["COLLECTION"] == "spherex_qr3"
    assert params["POS"] == "CIRCLE 133.795129 -7.245147 0.166700"
    assert params["RESPONSEFORMAT"] == "csv"
    assert params["MAXREC"] == "200"
    assert "TIME" not in params


def test_build_sia2_params_time_window():
    params = build_sia2_params(10.0, 10.0, 0.05, "spherex_qr2", 50,
                               t_min_mjd=60000.0, t_max_mjd=60100.0)
    assert params["TIME"] == "60000.000000 60100.000000"


def test_normalize_row_keeps_provenance():
    row = {
        "obs_id": "spherex_qr3_123", "obs_collection": "spherex_qr3",
        "s_ra": "133.79", "s_dec": "-7.24", "access_url": "https://example/x.fits",
        "t_min": "60001.0", "unknown_column": "kept-out",
    }
    out = normalize_row(row, "spherex_qr3", "2026-01-01T00:00:00+00:00")
    assert out["obs_id"] == "spherex_qr3_123"
    assert out["ra_deg"] == 133.79
    assert out["provenance"]["source"] == "NASA/IPAC IRSA"
    assert out["provenance"]["data_class"] == "OBSERVED_DATA"


def test_query_hash_stable():
    assert query_hash(1.0, 2.0, 10.0, ["b", "a"]) == query_hash(1.0, 2.0, 10.0, ["a", "b"])


def test_query_hash_changes_with_every_parameter():
    base = dict(ra=1.0, dec=2.0, radius_arcmin=10.0, collections=["a"])
    reference = query_hash(**base)
    for change in (
        {"t_min_mjd": 60000.0}, {"t_max_mjd": 60100.0}, {"maxrec": 10},
        {"service_url": "https://other.example/SIA"}, {"radius_arcmin": 11.0},
    ):
        assert query_hash(**{**base, **change}) != reference


def test_time_with_only_one_end_is_an_open_interval():
    assert build_sia2_params(1, 2, 0.1, "c", 10, t_min_mjd=60000.0)["TIME"] == "60000.000000 +Inf"
    assert build_sia2_params(1, 2, 0.1, "c", 10, t_max_mjd=60100.0)["TIME"] == "-Inf 60100.000000"
