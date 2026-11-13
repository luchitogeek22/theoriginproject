"""WP-06: offline test targets, proper motion, free-text coordinates, range validation."""

import time

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.database import SessionLocal, init_db
from app.main import app
from app.models import Target
from app.services.targets import (
    ResolutionError,
    TargetResolutionService,
    parse_coordinates,
    propagate,
)

client = TestClient(app)

FIVE = {
    "Barnard's Star": ["barnard", "gj 699"],
    "Epsilon Indi B": ["eps indi b", "epsilon indi b"],
    "WISE 0855": ["wise 0855", "wise j085510.83-071442.5"],
    "RW Aurigae": ["rw aur"],
    "R Draconis": ["r dra"],
}


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def refuse(*_a, **_k):
        raise AssertionError("network must not be used for the five test targets")

    monkeypatch.setattr(TargetResolutionService, "_simbad_query", refuse)


@pytest.mark.parametrize("name", list(FIVE))
def test_five_targets_resolve_offline(name):
    body = client.get("/api/v1/targets/resolve", params={"name": name}).json()
    assert body["name"] == name
    assert body["resolver"] == "test-targets"
    assert body["epoch"] == "J2000"
    assert body["propagated_ra_deg"] is not None


@pytest.mark.parametrize("name,alias", [(n, a) for n, al in FIVE.items() for a in al])
def test_aliases_resolve_to_the_same_target(name, alias):
    body = client.get("/api/v1/targets/resolve", params={"name": alias}).json()
    assert body["name"] == name


def test_wise0855_returns_simbad_j2000_catalog_position():
    body = client.get("/api/v1/targets/resolve", params={"name": "WISE 0855"}).json()
    assert body["ra_deg"] == pytest.approx(133.81890825, abs=1e-6)
    assert body["dec_deg"] == pytest.approx(-7.247048, abs=1e-6)


def test_propagated_position_differs_from_catalog_for_a_fast_mover():
    body = client.get(
        "/api/v1/targets/resolve",
        params={"name": "WISE 0855", "obstime": "2026-01-01"},
    ).json()
    assert body["propagated_epoch"].startswith("2026-01-01")
    dra = (body["propagated_ra_deg"] - body["ra_deg"]) * 3600 * 0.99
    ddec = (body["propagated_dec_deg"] - body["dec_deg"]) * 3600
    assert 190 < (dra**2 + ddec**2) ** 0.5 < 225


def test_synthetic_10000_mas_per_year_moves_100_arcsec_in_10_years():
    ra, dec = propagate(100.0, 0.0, 0.0, 10000.0, None, "2026-01-01", "2036-01-01")
    assert abs((dec - 0.0) * 3600 - 100.0) < 0.1
    assert abs(ra - 100.0) * 3600 < 0.1


def test_sexagesimal_from_the_challenge_text():
    ra, dec = parse_coordinates("08h55m10.831s -7d14m42.53s")
    assert ra == pytest.approx(133.795129, abs=1e-5)
    assert dec == pytest.approx(-7.245147, abs=1e-5)


def test_colon_separated_sexagesimal():
    ra, dec = parse_coordinates("08:55:10.8 -07:14:42")
    assert ra == pytest.approx(133.795, abs=1e-3)
    assert dec == pytest.approx(-7.245, abs=1e-3)


def test_decimal_pair_and_names_are_distinguished():
    assert parse_coordinates("133.795129 -7.245147") == (133.795129, -7.245147)
    assert parse_coordinates("133.795129, -7.245147") == (133.795129, -7.245147)
    assert parse_coordinates("WISE 0855") is None
    assert parse_coordinates("R Dra") is None


def test_free_text_query_through_the_api():
    body = client.post(
        "/api/v1/targets/resolve", json={"query": "08h55m10.831s -7d14m42.53s"}
    ).json()
    assert body["resolver"] == "manual"
    assert body["ra_deg"] == pytest.approx(133.795129, abs=1e-5)


@pytest.mark.parametrize(
    "query", ["999 0", "10 -200", "25h00m00s +10d00m00s"]
)
def test_out_of_range_free_text_is_rejected(query):
    assert client.post("/api/v1/targets/resolve", json={"query": query}).status_code == 422


@pytest.mark.parametrize("ra,dec", [(999.0, 0.0), (10.0, -200.0), (-1.0, 0.0), (360.0, 0.0)])
def test_ranges_rejected_on_every_coordinate_endpoint(ra, dec):
    assert client.post(
        "/api/v1/targets/resolve", json={"ra_deg": ra, "dec_deg": dec}
    ).status_code == 422
    assert client.get(
        "/api/v1/targets/resolve", params={"ra_deg": ra, "dec_deg": dec}
    ).status_code == 422
    assert client.post(
        "/api/v1/observations/search", json={"ra_deg": ra, "dec_deg": dec}
    ).status_code == 422
    assert client.post(
        "/api/v1/cutouts",
        json={"observation_id": 1, "ra_deg": ra, "dec_deg": dec},
    ).status_code == 422
    assert client.post(
        "/api/v1/analysis/spectral",
        json={"cutout_id": 1, "ra_deg": ra, "dec_deg": dec},
    ).status_code == 422
    assert client.post(
        "/api/v1/analysis/temporal",
        json={"cutout_a_id": 1, "cutout_b_id": 2, "ra_deg": ra, "dec_deg": dec},
    ).status_code == 422
    assert client.post(
        "/api/v1/research", json={"title": "x", "ra_deg": ra, "dec_deg": dec}
    ).status_code == 422


def _count_targets() -> int:
    init_db()
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(Target))


def test_get_resolve_does_not_write_rows():
    before = _count_targets()
    client.get("/api/v1/targets/resolve", params={"name": "WISE 0855"})
    client.get("/api/v1/targets/resolve", params={"ra_deg": 10.0, "dec_deg": 10.0})
    assert _count_targets() == before


def test_simbad_that_hangs_ends_within_the_deadline(monkeypatch):
    def hang(self, query):
        time.sleep(5)

    monkeypatch.setattr(TargetResolutionService, "_simbad_query", hang)
    service = TargetResolutionService()
    service.settings = service.settings.model_copy(update={"simbad_timeout_seconds": 0.3})
    started = time.monotonic()
    with pytest.raises(ResolutionError):
        service.resolve(name="Some Unknown Star")
    assert time.monotonic() - started < 1.5


def test_unknown_names_still_go_to_simbad(monkeypatch):
    seen = []

    class Row(dict):
        colnames = ["main_id", "ra", "dec"]

    def fake(self, query):
        seen.append(query)
        table = [Row(main_id="Sirius", ra=101.287, dec=-16.716)]
        return type("T", (list,), {"colnames": Row.colnames})(table)

    monkeypatch.setattr(TargetResolutionService, "_simbad_query", fake)
    body = client.get("/api/v1/targets/resolve", params={"name": "Sirius"}).json()
    assert seen == ["Sirius"]
    assert body["ra_deg"] == pytest.approx(101.287)
