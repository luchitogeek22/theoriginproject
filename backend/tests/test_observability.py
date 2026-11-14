import json
import logging

import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from app import main
from app.database import get_db
from app.logging import JsonFormatter, request_id_var
from app.services import jobs


@pytest.fixture()
def client():
    main._hits.clear()
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def _request_records(caplog, request_id):
    return [r for r in caplog.records if getattr(r, "request_id", None) == request_id]


def test_a_log_line_locates_a_request_by_the_id_returned_to_the_client(client, caplog):
    with caplog.at_level(logging.INFO):
        response = client.get("/api/v1/candidates", headers={"X-Forwarded-For": "10.1.0.1"})
    request_id = response.headers["x-request-id"]
    completed = [r for r in _request_records(caplog, request_id) if hasattr(r, "duration_ms")]
    assert len(completed) == 1
    record = completed[0]
    assert record.status == 200
    assert record.method == "GET"
    assert record.path == "/api/v1/candidates"
    assert record.duration_ms >= 0


def test_a_client_supplied_request_id_is_echoed_and_logged(client, caplog):
    with caplog.at_level(logging.INFO):
        response = client.get(
            "/api/v1/health", headers={"X-Request-ID": "trace-abc_123.9"}
        )
    assert response.headers["x-request-id"] == "trace-abc_123.9"
    assert _request_records(caplog, "trace-abc_123.9")


def test_an_unsafe_request_id_is_replaced(client):
    response = client.get("/api/v1/health", headers={"X-Request-ID": "a b;" + "x" * 200})
    issued = response.headers["x-request-id"]
    assert issued != "a b;" + "x" * 200
    assert len(issued) <= 64


def test_rejected_requests_are_logged_with_their_id(client, caplog, monkeypatch):
    monkeypatch.setattr(main.settings, "rate_limit_per_minute", 1)
    with caplog.at_level(logging.INFO):
        client.get("/api/v1/candidates", headers={"X-Forwarded-For": "10.1.0.2"})
        blocked = client.get("/api/v1/candidates", headers={"X-Forwarded-For": "10.1.0.2"})
    assert blocked.status_code == 429
    records = _request_records(caplog, blocked.headers["x-request-id"])
    assert [r.status for r in records if hasattr(r, "status")] == [429]


def test_json_formatter_emits_request_id_and_duration():
    token = request_id_var.set("req-42")
    try:
        record = logging.getLogRecordFactory()("t", logging.INFO, __file__, 1, "request", None, None)
        record.duration_ms = 12
        payload = json.loads(JsonFormatter().format(record))
    finally:
        request_id_var.reset(token)
    assert payload["request_id"] == "req-42"
    assert payload["duration_ms"] == 12


def test_health_reports_the_database(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


def test_health_is_503_when_the_database_is_unreachable(client):
    class Unreachable:
        def execute(self, *_args, **_kwargs):
            raise RuntimeError("connection refused")

    def broken():
        yield Unreachable()

    main.app.dependency_overrides[get_db] = broken
    response = client.get("/api/v1/health")
    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert response.json()["database"] == "unreachable"
    assert "connection refused" not in response.text


def test_each_job_stage_logs_its_duration(caplog, monkeypatch):
    # Fake clock: real sleep() is too coarse on Windows (~15.6 ms ticks) to assert on.
    clock = [1000.0]
    monkeypatch.setattr(jobs.time, "monotonic", lambda: clock[0])
    job_id = "obs-job-1"
    with caplog.at_level(logging.INFO, logger="jobs"):
        jobs.set_progress(job_id, "downloading", 0, 2)
        clock[0] += 0.5
        jobs.set_progress(job_id, "downloading", 1, 2)
        jobs.set_progress(job_id, "storing results", 2, 2)
        jobs.finish_stage_timing(job_id)
    stages = [
        (r.job_id, r.stage, r.duration_ms)
        for r in caplog.records
        if getattr(r, "job_id", None) == job_id and hasattr(r, "duration_ms")
    ]
    assert [(j, s) for j, s, _ in stages] == [(job_id, "downloading"), (job_id, "storing results")]
    assert stages[0][2] == 500
