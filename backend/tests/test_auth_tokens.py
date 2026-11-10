"""Supabase JWT verification: HS256 (legacy secret) and ES256 (JWKS signing keys).

New Supabase projects sign access tokens with ES256; the backend must accept
both algorithms. ES256 tests inject the JWKS cache directly so they never
touch the network.
"""

import base64
import hashlib
import hmac
import json
import time

import pytest

pytest.importorskip("fastapi")

cryptography = pytest.importorskip("cryptography")
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)

from fastapi import HTTPException

from app import auth


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _hs256_token(secret: str, claims: dict) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64url(json.dumps(claims).encode())
    sig = hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64url(sig)}"


def _es256_key_and_jwk(kid: str):
    private = ec.generate_private_key(ec.SECP256R1())
    numbers = private.public_key().public_numbers()
    jwk = {
        "kty": "EC",
        "crv": "P-256",
        "kid": kid,
        "x": _b64url(numbers.x.to_bytes(32, "big")),
        "y": _b64url(numbers.y.to_bytes(32, "big")),
    }
    return private, jwk


def _es256_token(private, kid: str, claims: dict) -> str:
    header = _b64url(json.dumps({"alg": "ES256", "kid": kid, "typ": "JWT"}).encode())
    payload = _b64url(json.dumps(claims).encode())
    der = private.sign(f"{header}.{payload}".encode("ascii"), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    raw = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    return f"{header}.{payload}.{_b64url(raw)}"


def _claims(**overrides) -> dict:
    claims = {"sub": "user-123", "email": "user@example.com", "exp": time.time() + 600}
    claims.update(overrides)
    return claims


def _inject_jwks(jwk: dict) -> None:
    auth._jwks_cache["keys"] = {jwk["kid"]: jwk}
    auth._jwks_cache["fetched_at"] = time.time()


def test_hs256_valid():
    claims = auth.verify_supabase_jwt(_hs256_token("test-secret", _claims()), "test-secret")
    assert claims["sub"] == "user-123"


def test_hs256_wrong_secret_rejected():
    with pytest.raises(HTTPException) as exc:
        auth.verify_supabase_jwt(_hs256_token("test-secret", _claims()), "other-secret")
    assert exc.value.status_code == 401


def test_rejects_none_algorithm():
    header = _b64url(json.dumps({"alg": "none", "typ": "JWT"}).encode())
    payload = _b64url(json.dumps(_claims()).encode())
    with pytest.raises(HTTPException) as exc:
        auth.verify_supabase_jwt(f"{header}.{payload}.", "test-secret")
    assert exc.value.status_code == 401


def test_es256_valid_via_jwks_cache():
    private, jwk = _es256_key_and_jwk("test-kid")
    _inject_jwks(jwk)
    claims = auth.verify_supabase_jwt(_es256_token(private, "test-kid", _claims()), "")
    assert claims["sub"] == "user-123"
    assert claims["email"] == "user@example.com"


def test_es256_unknown_kid_rejected(monkeypatch):
    monkeypatch.setattr(auth, "_fetch_jwks", lambda url: {"keys": []})
    auth._jwks_cache["keys"] = {}
    auth._jwks_cache["fetched_at"] = time.time()
    private, _ = _es256_key_and_jwk("other-kid")
    with pytest.raises(HTTPException) as exc:
        auth.verify_supabase_jwt(_es256_token(private, "unknown-kid", _claims()), "")
    assert exc.value.status_code == 401


def test_es256_expired_rejected():
    private, jwk = _es256_key_and_jwk("test-kid")
    _inject_jwks(jwk)
    with pytest.raises(HTTPException) as exc:
        auth.verify_supabase_jwt(
            _es256_token(private, "test-kid", _claims(exp=time.time() - 3600)), ""
        )
    assert exc.value.status_code == 401
