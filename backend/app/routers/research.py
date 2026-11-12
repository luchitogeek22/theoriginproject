"""Research journal: reproducible sessions + evidence reports (JSON/PDF/CSV)."""

import csv
import io
import json
import re
import unicodedata
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import UserInfo, get_current_user
from app.database import get_db
from app.models import ResearchSession
from app.schemas import ResearchCreateRequest, ResearchResponse
from app.config import get_settings
from app.services.evidence import (
    CURRENT_HASH_VERSION,
    build_report,
    compute_verification_hash,
    covers_text,
    report_markdown,
    report_pdf_bytes,
)

router = APIRouter()

REPORT_FORMATS = {
    "json": ("application/json", "json"),
    "markdown": ("text/markdown", "md"),
    "csv": ("text/csv", "csv"),
    "pdf": ("application/pdf", "pdf"),
}


def _stored_payload(record: ResearchSession) -> dict:
    try:
        payload = json.loads(record.payload_json or "{}")
    except ValueError:
        return {}
    return payload if isinstance(payload, dict) else {}


def _session_view(record: ResearchSession) -> dict:
    return {
        "id": record.id,
        "title": record.title,
        "target_name": record.target_name,
        "ra_deg": record.ra_deg,
        "dec_deg": record.dec_deg,
        "payload": _stored_payload(record),
        "verification_hash": record.verification_hash or "",
        "hash_version": record.hash_version or 1,
    }


def _ensure_hash(record: ResearchSession, db: Session) -> str:
    """Backfill the verification hash for rows predating the protocol."""
    if record.verification_hash:
        return record.verification_hash
    digest, _ = compute_verification_hash(_session_view(record))
    record.verification_hash = digest
    db.commit()
    return digest


def _serialize(record: ResearchSession, request: Request) -> ResearchResponse:
    payload = _stored_payload(record)
    base = str(request.base_url).rstrip("/")
    return ResearchResponse(
        id=record.id,
        title=record.title,
        target_name=record.target_name,
        ra_deg=record.ra_deg,
        dec_deg=record.dec_deg,
        payload=payload,
        created_at=record.created_at.isoformat() if record.created_at else "",
        updated_at=record.updated_at.isoformat() if record.updated_at else "",
        share_url=f"{base}/api/v1/research/{record.id}",
        verification_hash=record.verification_hash or "",
        hash_version=record.hash_version or 1,
    )


@router.post("/research", response_model=ResearchResponse)
def create_research(payload: ResearchCreateRequest, request: Request,
                    db: Session = Depends(get_db),
                    user: UserInfo | None = Depends(get_current_user)) -> ResearchResponse:
    title = payload.title or f"Research — {payload.target_name or 'untargeted'}"
    stored_payload = json.loads(json.dumps(payload.payload, default=str))
    stored_payload.setdefault("processing_version", get_settings().processing_version)
    verification_hash, _ = compute_verification_hash(
        {
            "title": title,
            "target_name": payload.target_name,
            "ra_deg": payload.ra_deg,
            "dec_deg": payload.dec_deg,
            "payload": stored_payload,
            "hash_version": CURRENT_HASH_VERSION,
        }
    )
    record = ResearchSession(
        id=uuid.uuid4().hex[:12],
        title=title,
        target_name=payload.target_name,
        ra_deg=payload.ra_deg,
        dec_deg=payload.dec_deg,
        payload_json=json.dumps(stored_payload),
        verification_hash=verification_hash,
        hash_version=CURRENT_HASH_VERSION,
        user_id=user.user_id if user else None,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _serialize(record, request)


@router.get("/research/{session_id}", response_model=ResearchResponse)
def get_research(session_id: str, request: Request, db: Session = Depends(get_db)) -> ResearchResponse:
    record = db.get(ResearchSession, session_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Research session not found")
    _ensure_hash(record, db)
    return _serialize(record, request)


@router.get("/research/{session_id}/verify")
def verify_research(session_id: str, db: Session = Depends(get_db)):
    """Recompute the verification hash and compare it with the registered one."""
    record = db.get(ResearchSession, session_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Research session not found")
    stored = record.verification_hash or ""
    recomputed, canonical = compute_verification_hash(_session_view(record))
    return {
        "session_id": session_id,
        "algorithm": "SHA-256",
        "hash_version": record.hash_version or 1,
        "stored_hash": stored,
        "recomputed_hash": recomputed,
        "match": bool(stored) and stored == recomputed,
        "canonical_string": canonical,
        "covers": covers_text(record.hash_version or 1),
        "note": (
            "The hash detects accidental edits and lets anyone audit a report. "
            "It is not tamper-proof against someone with database write access."
        ),
    }


def _slug(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    return slug or "untargeted"


def _download_response(payload: bytes | str, media_type: str, filename: str) -> StreamingResponse:
    data = payload.encode("utf-8") if isinstance(payload, str) else payload
    return StreamingResponse(
        io.BytesIO(data),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _csv_cell(value: object) -> str:
    text = "" if value is None else str(value)
    return f"'{text}" if text.startswith(FORMULA_PREFIXES) else text


def _report_csv(report: dict) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["obs_id", "collection", "date_obs", "detector", "band", "access_url"])
    for obs in report["observations"]:
        writer.writerow([_csv_cell(obs.get(key)) for key in
                         ("obs_id", "collection", "date_obs", "detector", "band", "access_url")])
    return buffer.getvalue()


@router.get("/evidence/{session_id}/report")
def evidence_report(session_id: str, request: Request, format: str = "json",
                    db: Session = Depends(get_db)) -> StreamingResponse:
    key = (format or "json").lower()
    if key not in REPORT_FORMATS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown format '{format}'. Use one of: {', '.join(sorted(REPORT_FORMATS))}.",
        )
    record = db.get(ResearchSession, session_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Research session not found")
    _ensure_hash(record, db)
    report = build_report(_session_view(record))
    media_type, ext = REPORT_FORMATS[key]
    filename = f"research-{_slug(record.target_name or record.title)}.{ext}"
    if key == "pdf":
        body: bytes | str = report_pdf_bytes(report)
    elif key == "markdown":
        body = report_markdown(report)
    elif key == "csv":
        body = _report_csv(report)
    else:
        body = json.dumps(report, indent=2, ensure_ascii=False)
    return _download_response(body, media_type, filename)
