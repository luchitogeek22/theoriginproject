"""Background job store: DB-backed status + in-process execution.

Heavy work runs in FastAPI BackgroundTasks; status and results persist in
the analysis_jobs table so polling survives across requests.
"""

import json
import traceback
import uuid
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from app.database import SessionLocal, init_db
from app.logging import get_logger
from app.models import AnalysisJob

log = get_logger("jobs")


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_job(kind: str, params: dict[str, Any]) -> str:
    init_db()
    job_id = uuid.uuid4().hex[:16]
    db = SessionLocal()
    try:
        db.add(AnalysisJob(id=job_id, kind=kind, status="queued",
                           params_json=json.dumps(params, default=str)))
        db.commit()
    finally:
        db.close()
    return job_id


def run_job(job_id: str, kind: str, params: dict[str, Any], func: Callable[[], dict]) -> None:
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
            job.error = f"{type(exc).__name__}: {exc}"
            log.warning("job %s failed: %s\n%s", job_id, exc, traceback.format_exc())
        db.commit()
    finally:
        db.close()


def get_job(job_id: str) -> dict[str, Any] | None:
    init_db()
    db = SessionLocal()
    try:
        job = db.get(AnalysisJob, job_id)
        if job is None:
            return None
        return {
            "job_id": job.id,
            "kind": job.kind,
            "status": job.status,
            "error": job.error or "",
            "created_at": job.created_at.isoformat() if job.created_at else "",
            "updated_at": job.updated_at.isoformat() if job.updated_at else "",
            "result": json.loads(job.result_json or "{}"),
        }
    finally:
        db.close()
