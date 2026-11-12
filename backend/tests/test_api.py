"""API contract tests (no archive access)."""

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "X-Request-ID" in response.headers


def test_resolve_manual_coordinates():
    response = client.post("/api/v1/targets/resolve",
                           json={"ra_deg": 133.795129, "dec_deg": -7.245147})
    assert response.status_code == 200
    body = response.json()
    assert body["ra_deg"] == 133.795129
    assert body["resolver"] == "manual"


def test_resolve_wise0855_uses_the_j2000_catalog_position():
    response = client.get("/api/v1/targets/resolve", params={"name": "WISE 0855"})
    assert response.status_code == 200
    body = response.json()
    assert body["ra_deg"] == pytest.approx(133.81890825)
    assert body["dec_deg"] == pytest.approx(-7.247048)


def test_resolve_empty_rejected():
    response = client.post("/api/v1/targets/resolve", json={})
    assert response.status_code == 422


def test_search_validates_coordinates():
    response = client.post("/api/v1/observations/search",
                           json={"ra_deg": 999.0, "dec_deg": 0.0})
    assert response.status_code == 422


def test_reference_stars_present():
    response = client.get("/api/v1/sky/reference-stars")
    assert response.status_code == 200
    assert len(response.json()) >= 10
