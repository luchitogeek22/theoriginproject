"""Integrity protocol tests (portal-free): hash registration, verification,
tamper detection, and canonical-string stability."""

import json
import re

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("sqlalchemy")

from fastapi import Request

from app.database import SessionLocal, init_db
from app.models import ResearchSession
from app.routers.research import create_research, verify_research
from app.schemas import ResearchCreateRequest
from app.services.evidence import compute_verification_hash

HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _request() -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": [],
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
        }
    )


def _payload(obs_ids=("o1", "o2"), cand_ids=(7,)):
    return {
        "observations": [
            {"obs_id": oid, "collection": "spherex_qr3", "date_obs": "2025-01-01"}
            for oid in obs_ids
        ],
        "candidates": [{"id": cid, "kind": "unclassified"} for cid in cand_ids],
    }


def _create(target="WISE 0855", ra=133.795129, dec=-7.245147, payload=None):
    init_db()
    db = SessionLocal()
    try:
        res = create_research(
            ResearchCreateRequest(
                title=f"Research - {target}",
                target_name=target,
                ra_deg=ra,
                dec_deg=dec,
                payload=payload if payload is not None else _payload(),
            ),
            _request(),
            db,
            None,  # anonymous mode: Depends(get_current_user) resolves only under FastAPI
        )
        return res.id, res.verification_hash
    finally:
        db.close()


def test_create_assigns_unique_hash():
    session_id, digest = _create()
    assert HEX64.match(digest), digest
    _, digest2 = _create(target="Other", ra=1.0, dec=2.0)
    assert HEX64.match(digest2)
    assert digest != digest2
    assert session_id != ""


def test_verify_match_on_untampered_session():
    session_id, stored = _create()
    db = SessionLocal()
    try:
        result = verify_research(session_id, db)
    finally:
        db.close()
    assert result["match"] is True
    assert result["stored_hash"] == stored
    assert result["recomputed_hash"] == stored
    assert "origin-v1" in result["canonical_string"]


def test_verify_detects_tampered_payload():
    session_id, stored = _create()
    db = SessionLocal()
    try:
        record = db.get(ResearchSession, session_id)
        assert record is not None
        payload = json.loads(record.payload_json)
        payload["observations"].append(
            {"obs_id": "forged", "collection": "spherex_qr3", "date_obs": "2026-01-01"}
        )
        record.payload_json = json.dumps(payload)
        db.commit()
        result = verify_research(session_id, db)
    finally:
        db.close()
    assert result["stored_hash"] == stored
    assert result["match"] is False
    assert result["recomputed_hash"] != stored


def test_canonical_string_ignores_observation_order():
    base = {
        "title": "t",
        "target_name": "WISE 0855",
        "ra_deg": 133.795129,
        "dec_deg": -7.245147,
    }
    digest_a, _ = compute_verification_hash({**base, "payload": _payload(("o1", "o2"))})
    digest_b, _ = compute_verification_hash({**base, "payload": _payload(("o2", "o1"))})
    assert digest_a == digest_b


def test_hash_changes_with_coordinates_and_candidates():
    base = {"title": "t", "target_name": "WISE 0855", "payload": _payload()}
    digest_a, _ = compute_verification_hash({**base, "ra_deg": 1.0, "dec_deg": 2.0})
    digest_b, _ = compute_verification_hash({**base, "ra_deg": 1.5, "dec_deg": 2.0})
    assert digest_a != digest_b
    digest_c, _ = compute_verification_hash(
        {**base, "ra_deg": 1.0, "dec_deg": 2.0, "payload": _payload(cand_ids=(7, 8))}
    )
    assert digest_a != digest_c
