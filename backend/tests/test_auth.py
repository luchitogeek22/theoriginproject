"""Supabase JWT verification + user attribution (portal-free).

Tokens are crafted with the standard library (HMAC-SHA256), mirroring what
Supabase signs with the project's JWT secret.
"""

import base64
import hashlib
import hmac
import json
import time
from types import SimpleNamespace

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("sqlalchemy")

from fastapi import HTTPException, Request
from sqlalchemy import select

from app import auth as auth_module
from app.auth import UserInfo, get_current_user, verify_supabase_jwt
from app.database import SessionLocal, init_db
from app.models import Candidate, ResearchSession
from app.routers.analysis import _store_images_and_candidates
from app.routers.research import create_research
from app.schemas import ResearchCreateRequest

SECRET = "test-jwt-secret"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _mint(sub="user-1", secret=SECRET, exp_offset=3600, alg="HS256", email="a@b.c"):
    header = _b64url(json.dumps({"alg": alg, "typ": "JWT"}).encode())
    payload = _b64url(
        json.dumps({"sub": sub, "email": email, "exp": int(time.time()) + exp_offset}).encode()
    )
    sig = hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64url(sig)}"


def _request(token: str | None = None) -> Request:
    headers = [(b"authorization", f"Bearer {token}".encode())] if token else []
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": headers,
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
        }
    )


def _configured(monkeypatch, secret=SECRET):
    monkeypatch.setattr(
        auth_module, "get_settings", lambda: SimpleNamespace(supabase_jwt_secret=secret)
    )


def test_valid_token_returns_claims():
    claims = verify_supabase_jwt(_mint(), SECRET)
    assert claims["sub"] == "user-1"


def test_wrong_secret_rejected():
    with pytest.raises(HTTPException) as exc:
        verify_supabase_jwt(_mint(secret="other"), SECRET)
    assert exc.value.status_code == 401


def test_expired_token_rejected():
    with pytest.raises(HTTPException) as exc:
        verify_supabase_jwt(_mint(exp_offset=-100), SECRET)
    assert exc.value.status_code == 401


def test_none_algorithm_rejected():
    forged = _mint(alg="none")
    with pytest.raises(HTTPException) as exc:
        verify_supabase_jwt(forged, SECRET)
    assert exc.value.status_code == 401


def test_malformed_token_rejected():
    with pytest.raises(HTTPException) as exc:
        verify_supabase_jwt("not-a-token", SECRET)
    assert exc.value.status_code == 401


def test_dependency_returns_user_when_configured(monkeypatch):
    _configured(monkeypatch)
    user = get_current_user(_request(_mint()))
    assert isinstance(user, UserInfo)
    assert user.user_id == "user-1"
    assert user.email == "a@b.c"


def test_dependency_requires_token_when_configured(monkeypatch):
    _configured(monkeypatch)
    with pytest.raises(HTTPException) as exc:
        get_current_user(_request(None))
    assert exc.value.status_code == 401


def test_dependency_anonymous_when_unconfigured(monkeypatch):
    _configured(monkeypatch, secret="")
    assert get_current_user(_request(None)) is None


def test_research_create_stores_user_id():
    init_db()
    db = SessionLocal()
    try:
        res = create_research(
            ResearchCreateRequest(title="t", target_name="WISE 0855", payload={}),
            _request(None),
            db,
            UserInfo(user_id="user-1"),
        )
        assert res.user_id == "user-1"
        record = db.get(ResearchSession, res.id)
        assert record is not None and record.user_id == "user-1"
    finally:
        db.close()


def test_candidates_stamped_with_user_id():
    import uuid

    job_id = f"job-auth-{uuid.uuid4().hex[:8]}"
    init_db()
    _store_images_and_candidates(
        job_id,
        "temporal",
        {"detections": [{"label": 1, "peak_snr": 9.1}], "astrometry": {"measured": False}},
        None,
        None,
        "user-1",
    )
    db = SessionLocal()
    try:
        rows = db.scalars(select(Candidate).where(Candidate.job_id == job_id)).all()
        assert len(rows) == 1
        assert rows[0].user_id == "user-1"
    finally:
        db.close()


def test_optional_dependency_is_anonymous_without_header_when_configured(monkeypatch):
    from app.auth import get_optional_user

    _configured(monkeypatch)
    assert get_optional_user(_request(None)) is None


def test_optional_dependency_returns_user_with_valid_token(monkeypatch):
    from app.auth import get_optional_user

    _configured(monkeypatch)
    user = get_optional_user(_request(_mint(sub="user-9")))
    assert isinstance(user, UserInfo)
    assert user.user_id == "user-9"


def test_optional_dependency_rejects_an_invalid_token(monkeypatch):
    from app.auth import get_optional_user

    _configured(monkeypatch)
    with pytest.raises(HTTPException) as exc:
        get_optional_user(_request(_mint(secret="another-secret")))
    assert exc.value.status_code == 401


def test_optional_dependency_is_anonymous_when_unconfigured(monkeypatch):
    from app.auth import get_optional_user

    _configured(monkeypatch, secret="")
    assert get_optional_user(_request(None)) is None


def test_missing_token_message_is_readable(monkeypatch):
    _configured(monkeypatch)
    with pytest.raises(HTTPException) as exc:
        get_current_user(_request(None))
    assert "REDACTED" not in exc.value.detail
    assert "token" in exc.value.detail.lower()


def _client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


ANALYSIS_BODY = {"cutout_a_id": 1, "cutout_b_id": 2}


def test_analysis_is_public_even_when_auth_is_configured(monkeypatch):
    _configured(monkeypatch)
    for path in ("differential", "temporal"):
        response = _client().post(f"/api/v1/analysis/{path}", json=ANALYSIS_BODY)
        assert response.status_code == 200, (path, response.text)
    response = _client().post(
        "/api/v1/analysis/spectral", json={"cutout_id": 1, "ra_deg": 10.0, "dec_deg": 5.0}
    )
    assert response.status_code == 200, response.text


def test_analysis_with_an_invalid_token_is_still_rejected(monkeypatch):
    _configured(monkeypatch)
    response = _client().post(
        "/api/v1/analysis/differential",
        json=ANALYSIS_BODY,
        headers={"Authorization": f"Bearer {_mint(secret='another-secret')}"},
    )
    assert response.status_code == 401


def test_analysis_accepts_a_valid_token(monkeypatch):
    _configured(monkeypatch)
    response = _client().post(
        "/api/v1/analysis/differential",
        json=ANALYSIS_BODY,
        headers={"Authorization": f"Bearer {_mint(sub='user-42')}"},
    )
    assert response.status_code == 200


def test_saving_to_the_journal_still_requires_a_session(monkeypatch):
    _configured(monkeypatch)
    body = {"title": "t", "target_name": "WISE 0855", "payload": {}}
    assert _client().post("/api/v1/research", json=body).status_code == 401
    ok = _client().post(
        "/api/v1/research", json=body, headers={"Authorization": f"Bearer {_mint()}"}
    )
    assert ok.status_code == 200, ok.text
