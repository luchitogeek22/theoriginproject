"""WP-09: job progress, concurrency cap, restart reconciliation, de-duplication."""

import threading
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from app.database import SessionLocal, engine
from app.main import app
from app.models import AnalysisJob, Cutout
from app.routers import analysis
from app.services import jobs

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_jobs():
    with SessionLocal() as db:
        db.query(AnalysisJob).delete()
        db.commit()
    yield


def wait_for(predicate, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return False


def status_of(job_id):
    return jobs.get_job(job_id)["status"]


def test_restart_leaves_no_job_running_or_queued():
    with SessionLocal() as db:
        db.add_all([
            AnalysisJob(id="r1", kind="spectral", status="running"),
            AnalysisJob(id="q1", kind="spectral", status="queued"),
            AnalysisJob(id="c1", kind="spectral", status="completed"),
        ])
        db.commit()
    assert jobs.reconcile_interrupted() == 2
    assert jobs.get_job("r1")["status"] == "failed"
    assert jobs.get_job("r1")["error"] == "interrupted by restart"
    assert jobs.get_job("q1")["status"] == "failed"
    assert jobs.get_job("c1")["status"] == "completed"


def test_lifespan_reconciles_on_startup():
    with SessionLocal() as db:
        db.add(AnalysisJob(id="r2", kind="spectral", status="running"))
        db.commit()
    with TestClient(app):
        pass
    assert jobs.get_job("r2")["status"] == "failed"


def test_fifth_concurrent_job_stays_queued_until_one_finishes(monkeypatch):
    monkeypatch.setattr(jobs, "_semaphore", threading.BoundedSemaphore(4))
    gates = [threading.Event() for _ in range(5)]
    ids = [jobs.create_job("spectral", {"n": n})[0] for n in range(5)]
    threads = [
        threading.Thread(
            target=jobs.run_job, args=(ids[n], "spectral", {}, lambda g=gates[n]: g.wait(5) or {})
        )
        for n in range(5)
    ]
    for thread in threads[:4]:
        thread.start()
    assert wait_for(lambda: sum(status_of(i) == "running" for i in ids[:4]) == 4)
    threads[4].start()
    time.sleep(0.2)
    assert status_of(ids[4]) == "queued"
    gates[0].set()
    assert wait_for(lambda: status_of(ids[4]) == "running")
    for gate in gates:
        gate.set()
    for thread in threads:
        thread.join(5)
    assert all(status_of(i) == "completed" for i in ids)


def test_queue_cap_answers_429(monkeypatch):
    monkeypatch.setattr(jobs.get_settings(), "max_queued_jobs", 2)
    jobs.create_job("spectral", {"n": 1})
    jobs.create_job("spectral", {"n": 2})
    with pytest.raises(jobs.QueueFullError):
        jobs.create_job("spectral", {"n": 3})
    response = client.post(
        "/api/v1/analysis/spectral", json={"cutout_id": 1, "ra_deg": 1.0, "dec_deg": 1.0}
    )
    assert response.status_code == 429


def test_identical_simultaneous_creations_share_one_job():
    barrier = threading.Barrier(2)
    results = []

    def create():
        barrier.wait()
        results.append(jobs.create_job("spectral", {"cutout_id": 7, "ra_deg": 1.0}))

    threads = [threading.Thread(target=create) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert results[0][0] == results[1][0]
    assert sorted(created for _, created in results) == [False, True]


def test_identical_request_while_queued_returns_the_same_job_and_runs_once(monkeypatch):
    runs = []
    monkeypatch.setattr(jobs, "run_job", lambda *a, **k: runs.append(a[0]))
    body = {"cutout_id": 99, "ra_deg": 10.0, "dec_deg": 10.0}
    first = client.post("/api/v1/analysis/spectral", json=body).json()
    second = client.post("/api/v1/analysis/spectral", json=body).json()
    assert first["job_id"] == second["job_id"]
    assert runs == [first["job_id"]]


def test_a_finished_job_does_not_block_a_new_identical_request(monkeypatch):
    monkeypatch.setattr(jobs, "run_job", lambda *a, **k: None)
    body = {"cutout_id": 98, "ra_deg": 10.0, "dec_deg": 10.0}
    first = client.post("/api/v1/analysis/spectral", json=body).json()
    with SessionLocal() as db:
        db.get(AnalysisJob, first["job_id"]).status = "completed"
        db.commit()
    assert client.post("/api/v1/analysis/spectral", json=body).json()["job_id"] != first["job_id"]


def test_status_endpoint_runs_a_single_sql_statement():
    job_id, _ = jobs.create_job("spectral", {"n": 1})
    statements = []

    def record(conn, cursor, statement, *args):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        assert client.get(f"/api/v1/jobs/{job_id}").status_code == 200
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert len(statements) == 1


def test_progress_is_exposed_in_the_job_status():
    job_id, _ = jobs.create_job("spectral", {"n": 5})
    jobs.set_progress(job_id, "aligning", 2, 5)
    body = client.get(f"/api/v1/jobs/{job_id}").json()
    assert (body["stage"], body["done"], body["total"]) == ("aligning", 2, 5)


def test_failure_message_hides_paths_and_exception_names():
    with SessionLocal() as db:
        cutout = Cutout(
            observation_id=1, ra_deg=1.0, dec_deg=1.0, size_arcmin=6.0,
            storage_key="cutouts/does_not_exist_anywhere.fits",
        )
        db.add(cutout)
        db.commit()
        cutout_id = cutout.id
    response = client.post(
        "/api/v1/analysis/spectral", json={"cutout_id": cutout_id, "ra_deg": 1.0, "dec_deg": 1.0}
    ).json()
    job = jobs.get_job(response["job_id"])
    assert job["status"] == "failed"
    assert "does_not_exist" not in job["error"]
    assert "/" not in job["error"]
    assert "Error" not in job["error"]
    assert job["error"]


def test_user_facing_errors_keep_their_message():
    def boom():
        raise jobs.UserFacingError("Different detectors (3 vs 6).")

    job_id, _ = jobs.create_job("spectral", {"n": 11})
    jobs.run_job(job_id, "spectral", {}, boom)
    assert jobs.get_job(job_id)["error"] == "Different detectors (3 vs 6)."


def test_routers_no_longer_initialise_the_schema_per_request():
    import pathlib

    offenders = [
        str(p) for p in pathlib.Path(analysis.__file__).parent.parent.rglob("*.py")
        if "init_db()" in p.read_text() and p.name not in ("main.py", "database.py")
    ]
    assert offenders == []
