"""Portal-free endpoint tests: call route functions directly with a real DB.

Starlette's TestClient needs event-loop sockets, which sandboxed environments
may block (WinError 10013). These tests exercise the same endpoint code —
status, Content-Type, Content-Disposition attachment filename, and body —
with no sockets and no event loop, so they pass everywhere.
"""

import json

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("sqlalchemy")

from fastapi import HTTPException, Request

from app.database import SessionLocal, init_db
from app.models import ResearchSession
from app.routers.research import _report_csv, evidence_report
from app.services.evidence import build_report, report_markdown, report_pdf_bytes


def _request() -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": [],
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
        }
    )


@pytest.fixture()
def session_id() -> str:
    init_db()
    db = SessionLocal()
    try:
        record = ResearchSession(
            id="directtest01",
            title="Research - WISE 0855",
            target_name="WISE 0855",
            ra_deg=133.795129,
            dec_deg=-7.245147,
            payload_json=json.dumps(
                {
                    "observations": [
                        {
                            "obs_id": "o1",
                            "collection": "spherex_qr3",
                            "date_obs": "2025-01-01",
                            "detector": "d1",
                            "band": "b1",
                            "access_url": "https://example/x",
                        }
                    ],
                    "methods": ["m"],
                    "limitations": ["l"],
                }
            ),
        )
        db.merge(record)
        db.commit()
        return record.id
    finally:
        db.close()


def _session_dict() -> dict:
    return {
        "title": "Research - WISE 0855",
        "target_name": "WISE 0855",
        "ra_deg": 133.795129,
        "dec_deg": -7.245147,
        "payload": {
            "observations": [
                {
                    "obs_id": "o1",
                    "collection": "spherex_qr3",
                    "date_obs": "2025-01-01",
                    "detector": "d1",
                    "band": "b1",
                    "access_url": "https://example/x",
                }
            ],
            "methods": ["m"],
            "measurements": [],
            "limitations": ["l"],
        },
    }


CASES = [
    ("json", "application/json", "json"),
    ("markdown", "text/markdown", "md"),
    ("csv", "text/csv", "csv"),
    ("pdf", "application/pdf", "pdf"),
]


@pytest.mark.parametrize("fmt,media,ext", CASES)
def test_evidence_report_download(session_id, fmt, media, ext):
    """Download contract: status, Content-Type and attachment filename."""
    db = SessionLocal()
    try:
        response = evidence_report(session_id, _request(), fmt, db)
    finally:
        db.close()
    assert response.status_code == 200
    assert response.headers["content-type"].startswith(media)
    disposition = response.headers["content-disposition"]
    assert disposition == f'attachment; filename="research-wise-0855.{ext}"', disposition


def test_evidence_bodies_carry_content():
    """Bodies are produced by the pure builders (no event loop needed)."""
    report = build_report(_session_dict())
    assert report["target"]["name"] == "WISE 0855"
    assert '"target"' in json.dumps(report)
    assert "# Research - WISE 0855" in report_markdown(report)
    assert "obs_id,collection" in _report_csv(report)
    pdf = report_pdf_bytes(report)
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1000


def test_evidence_report_rejects_unknown_format(session_id):
    db = SessionLocal()
    try:
        with pytest.raises(HTTPException) as exc:
            evidence_report(session_id, _request(), "xlsx", db)
    finally:
        db.close()
    assert exc.value.status_code == 422


def test_evidence_report_unknown_session():
    db = SessionLocal()
    try:
        with pytest.raises(HTTPException) as exc:
            evidence_report("no-such-session", _request(), "json", db)
    finally:
        db.close()
    assert exc.value.status_code == 404
