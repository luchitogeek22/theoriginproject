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
    assert result["canonical_string"].startswith("origin-v2")


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


LEGACY_HASH = "ee4aed40b220a22a6164088ee6e59983cc993f7910899515766741e0eba5dade"


def _client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


def _v2_session(**overrides):
    session = {
        "title": "Research - WISE 0855",
        "target_name": "WISE 0855",
        "ra_deg": 133.795129,
        "dec_deg": -7.245147,
        "hash_version": 2,
        "payload": {
            "observations": [
                {"obs_id": "o1", "collection": "spherex_qr3", "band": "b1", "detector": "d1"}
            ],
            "measurements": [{"name": "flux", "value": 1.5}],
            "candidates": [{"id": 7, "snr": 6.1, "job_id": "job-a"}],
            "cutouts": [{"cutout_id": 1, "sha256": "a" * 64}],
            "processing_version": "1",
        },
    }
    session.update(overrides)
    return session


@pytest.mark.parametrize(
    "mutate",
    [
        lambda s: s["payload"]["measurements"][0].update(value=1.6),
        lambda s: s["payload"]["candidates"][0].update(snr=7.0),
        lambda s: s["payload"]["observations"][0].update(band="b2"),
        lambda s: s.update(title="Another title"),
        lambda s: s["payload"]["candidates"][0].update(job_id="job-b"),
        lambda s: s["payload"]["cutouts"][0].update(sha256="b" * 64),
        lambda s: s["payload"].update(processing_version="2"),
    ],
)
def test_v2_hash_changes_when_any_covered_value_changes(mutate):
    base, _ = compute_verification_hash(_v2_session())
    changed = _v2_session()
    mutate(changed)
    digest, canonical = compute_verification_hash(changed)
    assert digest != base
    assert canonical.startswith("origin-v2")


def test_v2_hash_is_stable_across_key_order():
    reordered = _v2_session()
    reordered["payload"] = dict(reversed(list(reordered["payload"].items())))
    assert compute_verification_hash(reordered)[0] == compute_verification_hash(_v2_session())[0]


def test_existing_v1_record_still_verifies_and_is_not_rewritten():
    init_db()
    db = SessionLocal()
    try:
        db.add(
            ResearchSession(
                id="legacyv1abc",
                title="Legacy",
                target_name="WISE 0855",
                ra_deg=133.795129,
                dec_deg=-7.245147,
                payload_json=json.dumps(
                    {
                        "observations": [{"obs_id": "o1", "collection": "spherex_qr3"}],
                        "candidates": [{"id": 7}],
                    }
                ),
                verification_hash=LEGACY_HASH,
            )
        )
        db.commit()
        result = verify_research("legacyv1abc", db)
        record = db.get(ResearchSession, "legacyv1abc")
        assert record.verification_hash == LEGACY_HASH
        assert record.hash_version == 1
    finally:
        db.close()
    assert result["match"] is True
    assert result["hash_version"] == 1
    assert result["canonical_string"].startswith("origin-v1")


def test_new_records_use_v2_and_verify_through_the_api():
    client = _client()
    body = {
        "title": "t",
        "target_name": "WISE 0855",
        "ra_deg": 133.795129,
        "dec_deg": -7.245147,
        "payload": {
            "observations": [{"obs_id": "o1", "collection": "spherex_qr3", "band": 1.25}],
            "measurements": [{"name": "flux", "value": 0.1 + 0.2}],
            "candidates": [{"id": 3, "snr": 5.5, "job_id": "j1"}],
        },
    }
    created = client.post("/api/v1/research", json=body)
    assert created.status_code == 200, created.text
    assert created.json()["hash_version"] == 2
    verified = client.get(f"/api/v1/research/{created.json()['id']}/verify").json()
    assert verified["match"] is True
    assert verified["hash_version"] == 2
    assert verified["canonical_string"].startswith("origin-v2")
    assert "measurements" in verified["covers"]
    assert verified["stored_hash"] == created.json()["verification_hash"]


def test_report_lists_what_the_hash_covers():
    client = _client()
    created = client.post(
        "/api/v1/research", json={"title": "t", "target_name": "X", "payload": {}}
    ).json()
    report = client.get(f"/api/v1/evidence/{created['id']}/report?format=json").json()
    covers = report["integrity"]["covers"]
    for item in ("title", "measurements", "candidates", "job", "SHA-256", "processing_version"):
        assert item in covers


def test_oversized_body_is_rejected():
    response = _client().post(
        "/api/v1/research",
        json={"title": "t", "payload": {"blob": "x" * (2 * 1024 * 1024)}},
    )
    assert response.status_code in (413, 422)


def test_body_above_256kb_is_rejected_with_422():
    response = _client().post(
        "/api/v1/research",
        json={"title": "t", "payload": {"blob": "x" * (300 * 1024)}},
    )
    assert response.status_code == 422


def test_title_longer_than_256_is_rejected():
    response = _client().post("/api/v1/research", json={"title": "t" * 257, "payload": {}})
    assert response.status_code == 422


def test_lists_longer_than_200_are_rejected():
    items = [{"obs_id": str(i), "collection": "c"} for i in range(201)]
    response = _client().post("/api/v1/research", json={"title": "t", "payload": {"observations": items}})
    assert response.status_code == 422
    ok = _client().post(
        "/api/v1/research", json={"title": "t", "payload": {"observations": items[:200]}}
    )
    assert ok.status_code == 200


@pytest.mark.parametrize("key", ["observations", "candidates"])
def test_non_object_elements_are_rejected_with_422(key):
    response = _client().post(
        "/api/v1/research", json={"title": "t", "payload": {key: ["not-an-object", 5]}}
    )
    assert response.status_code == 422


def test_csv_cells_that_look_like_formulas_are_neutralised():
    from app.routers.research import _report_csv

    report = {
        "observations": [
            {"obs_id": '=HYPERLINK("http://evil.example","x")', "collection": "+cmd",
             "date_obs": "-1+1", "detector": "@SUM(A1)", "band": "\tx", "access_url": "\rx"},
            {"obs_id": "safe-id", "collection": "spherex_qr3", "date_obs": "2025-01-01",
             "detector": 3, "band": None, "access_url": "https://irsa.example/x"},
        ]
    }
    rows = list(__import__("csv").reader(__import__("io").StringIO(_report_csv(report))))
    assert rows[1] == ['\'=HYPERLINK("http://evil.example","x")', "'+cmd", "'-1+1", "'@SUM(A1)",
                       "'\tx", "'\rx"]
    assert rows[2] == ["safe-id", "spherex_qr3", "2025-01-01", "3", "", "https://irsa.example/x"]


def test_report_survives_non_object_observations_stored_before_validation():
    init_db()
    db = SessionLocal()
    try:
        db.add(ResearchSession(id="badshape001", title="t", target_name="x",
                               payload_json=json.dumps({"observations": ["junk", 4]})))
        db.commit()
    finally:
        db.close()
    response = _client().get("/api/v1/evidence/badshape001/report?format=csv")
    assert response.status_code == 200
