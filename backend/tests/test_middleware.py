import time

import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from app import main
from app.database import get_db

ORIGIN = "http://localhost:3000"
CANDIDATES = "/api/v1/candidates"


@pytest.fixture()
def client(monkeypatch):
    main._hits.clear()
    monkeypatch.setattr(main.settings, "rate_limit_per_minute", 3)
    yield TestClient(main.app)
    main._hits.clear()
    main.app.dependency_overrides.clear()


def _get(client, path=CANDIDATES, ip="10.0.0.1", **headers):
    return client.get(path, headers={"X-Forwarded-For": ip, **headers})


def test_429_carries_cors_headers_for_an_allowed_origin(client):
    for _ in range(3):
        assert _get(client, Origin=ORIGIN).status_code == 200
    blocked = _get(client, Origin=ORIGIN)
    assert blocked.status_code == 429
    assert blocked.headers["access-control-allow-origin"] == ORIGIN
    assert blocked.headers["x-request-id"]


def test_500_carries_cors_headers_for_an_allowed_origin(client):
    def broken():
        raise RuntimeError("database exploded")

    main.app.dependency_overrides[get_db] = broken
    response = _get(client, Origin=ORIGIN)
    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == ORIGIN
    assert response.json() == {"detail": "Internal error. The request was logged."}


def test_a_hundred_preflights_do_not_consume_the_quota(client):
    for _ in range(100):
        preflight = client.options(
            CANDIDATES,
            headers={
                "Origin": ORIGIN,
                "Access-Control-Request-Method": "GET",
                "X-Forwarded-For": "10.0.0.2",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == ORIGIN
    assert _get(client, ip="10.0.0.2").status_code == 200


def test_health_is_exempt_from_the_rate_limit(client):
    statuses = {_get(client, "/api/v1/health", ip="10.0.0.3").status_code for _ in range(8)}
    assert statuses == {200}


def test_clients_with_different_forwarded_for_do_not_share_a_counter(client):
    for _ in range(3):
        assert _get(client, ip="10.0.1.1").status_code == 200
    assert _get(client, ip="10.0.1.1").status_code == 429
    assert _get(client, ip="10.0.1.2").status_code == 200


def test_the_counter_key_is_the_last_forwarded_hop(client):
    for index in range(3):
        assert _get(client, ip=f"spoofed-{index}, 10.0.2.1").status_code == 200
    assert _get(client, ip="another-spoof, 10.0.2.1").status_code == 429


def test_forwarded_for_is_ignored_when_no_proxy_is_trusted(client, monkeypatch):
    monkeypatch.setattr(main.settings, "trusted_proxy_hops", 0)
    for index in range(3):
        assert _get(client, ip=f"10.0.3.{index}").status_code == 200
    assert _get(client, ip="10.0.3.99").status_code == 429


def test_idle_windows_are_purged(client):
    main._hits["stale-client"] = [time.monotonic() - 120]
    main._state["last_sweep"] = 0.0
    assert _get(client, ip="10.0.4.1").status_code == 200
    assert "stale-client" not in main._hits


@pytest.mark.parametrize("limit", [-5, 0, 201])
def test_candidates_limit_outside_1_to_200_is_422(client, limit):
    assert _get(client, f"{CANDIDATES}?limit={limit}", ip="10.0.5.1").status_code == 422


@pytest.mark.parametrize("limit", [1, 200])
def test_candidates_limit_inside_range_is_accepted(client, limit):
    response = _get(client, f"{CANDIDATES}?limit={limit}", ip="10.0.5.2")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_two_megabyte_body_is_413(client):
    body = b'{"title": "t", "payload": {"blob": "' + b"x" * (2 * 1024 * 1024) + b'"}}'
    response = client.post(
        "/api/v1/research",
        content=body,
        headers={"Content-Type": "application/json", "X-Forwarded-For": "10.0.6.1"},
    )
    assert response.status_code == 413
    assert response.json() == {"detail": "Request body too large (limit 1 MB)."}


def test_chunked_two_megabyte_body_is_413(client):
    chunks = (b"x" * 1024 for _ in range(2048))
    response = client.post(
        "/api/v1/research",
        content=chunks,
        headers={"Content-Type": "application/json", "X-Forwarded-For": "10.0.6.2"},
    )
    assert response.status_code == 413


def test_small_body_still_reaches_the_endpoint(client):
    response = client.post(
        "/api/v1/research",
        json={"title": "t", "payload": {}},
        headers={"X-Forwarded-For": "10.0.6.3"},
    )
    assert response.status_code == 200


def test_large_responses_are_gzipped(client):
    response = client.get(
        "/openapi.json", headers={"Accept-Encoding": "gzip", "X-Forwarded-For": "10.0.7.1"}
    )
    assert response.status_code == 200
    assert response.headers["content-encoding"] == "gzip"


def test_docs_are_disabled_in_production():
    from app.config import Settings

    production = TestClient(main.create_app(Settings(environment="production")))
    assert production.get("/docs").status_code == 404
    assert production.get("/redoc").status_code == 404
    assert production.get("/openapi.json").status_code == 404
    development = TestClient(main.create_app(Settings(environment="development")))
    assert development.get("/docs").status_code == 200
