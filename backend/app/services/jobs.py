"""Background jobs: DB-backed status, a concurrency cap and a bounded queue.

Heavy work runs in FastAPI BackgroundTasks; status and results persist in the
analysis_jobs table so polling survives across requests. Jobs left running by a
restart are marked failed at startup. Identical requests share one active job.
"""

import hashlib
import json
import threading
import time
import traceback
import uuid
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select, update

from app.config import get_settings
from app.database import SessionLocal
from app.logging import get_logger
from app.models import AnalysisJob

log = get_logger("jobs")

ACTIVE = ("queued", "running")
INTERRUPTED_MESSAGE = "interrupted by restart"
GENERIC_FAILURE = "The analysis failed. The error was logged."
MISSING_INPUT = "A stored input file is no longer available."

_semaphore = threading.BoundedSemaphore(max(1, get_settings().max_concurrent_jobs))
_create_lock = threading.Lock()


class QueueFullError(RuntimeError):
    pass


class UserFacingError(Exception):
    """An error whose message is safe and useful to show to the person who asked."""


def input_hash(kind: str, params: dict[str, Any]) -> str:
    public = {k: v for k, v in params.items() if not k.startswith("_")}
    raw = json.dumps({"kind": kind, "params": public}, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def public_error(exc: BaseException) -> str:
    if isinstance(exc, UserFacingError):
        return str(exc)
    if isinstance(exc, FileNotFoundError):
        return MISSING_INPUT
    return GENERIC_FAILURE


def create_job(kind: str, params: dict[str, Any]) -> tuple[str, bool]:
    """Return (job_id, created). An identical active job is reused, not duplicated."""
    digest = input_hash(kind, params)
    with _create_lock, SessionLocal() as db:
        existing = db.scalar(
            select(AnalysisJob.id)
            .where(AnalysisJob.input_hash == digest, AnalysisJob.status.in_(ACTIVE))
            .order_by(AnalysisJob.created_at)
            .limit(1)
        )
        if existing is not None:
            return existing, False
        queued = db.scalar(
            select(func.count()).select_from(AnalysisJob).where(AnalysisJob.status == "queued")
        )
        if queued >= get_settings().max_queued_jobs:
            raise QueueFullError("Too many pending analyses.")
        job_id = uuid.uuid4().hex[:16]
        db.add(AnalysisJob(id=job_id, kind=kind, status="queued", input_hash=digest,
                           params_json=json.dumps(params, default=str)))
        db.commit()
        return job_id, True


_stage_clock: dict[str, tuple[str, float]] = {}


def finish_stage_timing(job_id: str) -> None:
    current = _stage_clock.pop(job_id, None)
    if current:
        elapsed = int((time.monotonic() - current[1]) * 1000)
        log.info("job stage finished", extra={"job_id": job_id, "stage": current[0],
                                              "duration_ms": elapsed})


def set_progress(job_id: str, stage: str, done: int, total: int) -> None:
    current = _stage_clock.get(job_id)
    if current is None or current[0] != stage:
        finish_stage_timing(job_id)
        _stage_clock[job_id] = (stage, time.monotonic())
    with SessionLocal() as db:
        db.execute(
            update(AnalysisJob).where(AnalysisJob.id == job_id)
            .values(stage=stage, done=done, total=total)
        )
        db.commit()


def run_job(job_id: str, kind: str, params: dict[str, Any], func: Callable[[], dict]) -> None:
    with _semaphore:
        db = SessionLocal()
        try:
            job = db.get(AnalysisJob, job_id)
            if job is None:
                return
            job.status = "running"
            db.commit()
            try:
                result = func()
                job.result_json = json.dumps(result, default=str)
                job.status = "completed"
            except Exception as exc:  # noqa: BLE001 - recorded on the job
                job.status = "failed"
                job.error = public_error(exc)
                log.warning("job %s failed: %s\n%s", job_id, exc, traceback.format_exc())
            db.commit()
        finally:
            finish_stage_timing(job_id)
            db.close()


def reconcile_interrupted() -> int:
    """Mark jobs a previous process left queued or running as failed."""
    with SessionLocal() as db:
        outcome = db.execute(
            update(AnalysisJob).where(AnalysisJob.status.in_(ACTIVE))
            .values(status="failed", error=INTERRUPTED_MESSAGE)
        )
        db.commit()
        return outcome.rowcount or 0


def _iso(value: datetime | None) -> str:
    return value.astimezone(timezone.utc).isoformat() if value else ""


def get_job(job_id: str, with_result: bool = True) -> dict[str, Any] | None:
    columns = [
        AnalysisJob.id, AnalysisJob.kind, AnalysisJob.status, AnalysisJob.error,
        AnalysisJob.created_at, AnalysisJob.updated_at,
        AnalysisJob.stage, AnalysisJob.done, AnalysisJob.total,
    ]
    if with_result:
        columns.append(AnalysisJob.result_json)
    with SessionLocal() as db:
        row = db.execute(select(*columns).where(AnalysisJob.id == job_id)).first()
    if row is None:
        return None
    job = {
        "job_id": row.id,
        "kind": row.kind,
        "status": row.status,
        "error": row.error or "",
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
        "stage": row.stage or "",
        "done": row.done or 0,
        "total": row.total or 0,
    }
    if with_result:
        job["result"] = json.loads(row.result_json or "{}")
    return job
