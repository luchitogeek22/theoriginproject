"""Shared job submission: reuse an identical active job, answer 429 when the queue is full."""

from typing import Callable

from fastapi import BackgroundTasks, HTTPException

from app.auth import UserInfo
from app.schemas import JobResponse
from app.services import jobs as job_store


def submit_job(
    kind: str,
    params: dict,
    tasks: BackgroundTasks,
    user: UserInfo | None,
    runner: Callable[[dict], dict],
) -> JobResponse:
    params["user_id"] = user.user_id if user else None
    try:
        job_id, created = job_store.create_job(kind, params)
    except job_store.QueueFullError as exc:
        raise HTTPException(
            status_code=429, detail="Too many pending analyses. Retry in a moment."
        ) from exc
    if created:
        params["_job_id"] = job_id
        tasks.add_task(job_store.run_job, job_id, kind, params, lambda: runner(params))
    status = (job_store.get_job(job_id, with_result=False) or {}).get("status", "queued")
    return JobResponse(job_id=job_id, kind=kind, status=status)
