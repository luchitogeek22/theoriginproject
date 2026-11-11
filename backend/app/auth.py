"""Supabase Auth JWT verification (HS256 legacy secret + ES256 signing keys).

Auth is enforced only when SUPABASE_JWT_SECRET is configured. Without it,
the API runs in anonymous mode (user_id None) so local development and demos
keep working; nothing is faked — callers simply have no identity.

HS256 tokens are checked against the project's JWT secret. ES256 tokens
(what new Supabase projects issue) are checked against the project's JWKS
signing keys, fetched once and cached. In both cases the algorithm is pinned
exactly (rejecting "none"), the signature is verified, and exp is enforced
with a small leeway.
"""

import base64
import hashlib
import hmac
import json
import time
import urllib.request
from dataclasses import dataclass

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from fastapi import HTTPException, Request

from app.config import get_settings

LEEWAY_SECONDS = 30
JWKS_TTL_SECONDS = 3600
JWKS_TIMEOUT_SECONDS = 10

_jwks_cache = {"keys": {}, "fetched_at": 0.0}


@dataclass
class UserInfo:
    user_id: str
    email: str = ""


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    try:
        return base64.urlsafe_b64decode(segment + padding)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Malformed session token.") from exc


def _fetch_jwks(url: str) -> dict:
    """Download the Supabase JWKS document. Raises 503 when unreachable."""
    try:
        with urllib.request.urlopen(url, timeout=JWKS_TIMEOUT_SECONDS) as response:
            document = json.load(response)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail="Unable to reach Supabase signing keys."
        ) from exc
    if not isinstance(document, dict):
        raise HTTPException(status_code=503, detail="Invalid Supabase signing keys.")
    return document


def _jwks_url() -> str:
    return f"{get_settings().supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


def _refresh_jwks() -> dict[str, dict]:
    keys: dict[str, dict] = {}
    for entry in _fetch_jwks(_jwks_url()).get("keys", []):
        if isinstance(entry, dict) and entry.get("kid"):
            keys[str(entry["kid"])] = entry
    _jwks_cache["keys"] = keys
    _jwks_cache["fetched_at"] = time.time()
    return keys


def _get_jwks_key(kid: str) -> dict:
    keys = _jwks_cache["keys"]
    if kid in keys and time.time() - _jwks_cache["fetched_at"] < JWKS_TTL_SECONDS:
        return keys[kid]
    if kid in _refresh_jwks():
        return _jwks_cache["keys"][kid]
    raise HTTPException(status_code=401, detail="Unknown token signing key.")


def _verify_hs256(signing_input: bytes, signature: bytes, secret: str) -> None:
    expected = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid session signature.")


def _verify_es256(header: dict, signing_input: bytes, signature: bytes) -> None:
    kid = header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Token has no key id.")
    if len(signature) != 64:
        raise HTTPException(status_code=401, detail="Malformed token signature.")
    jwk = _get_jwks_key(str(kid))
    if jwk.get("kty") != "EC" or jwk.get("crv") != "P-256" or not jwk.get("x") or not jwk.get("y"):
        raise HTTPException(status_code=401, detail="Unsupported signing key.")
    try:
        x = int.from_bytes(_b64url_decode(str(jwk["x"])), "big")
        y = int.from_bytes(_b64url_decode(str(jwk["y"])), "big")
        public_key = ec.EllipticCurvePublicNumbers(x, y, ec.SECP256R1()).public_key()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid signing key.") from exc
    r = int.from_bytes(signature[:32], "big")
    s = int.from_bytes(signature[32:], "big")
    try:
        public_key.verify(
            encode_dss_signature(r, s), signing_input, ec.ECDSA(hashes.SHA256())
        )
    except InvalidSignature as exc:
        raise HTTPException(status_code=401, detail="Invalid session signature.") from exc


def verify_supabase_jwt(token: str, secret: str) -> dict:
    """Validate a Supabase access token. Returns its claims or raises 401."""
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Malformed session token.")
    header_b64, payload_b64, signature_b64 = parts
    try:
        header = json.loads(_b64url_decode(header_b64))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Malformed session token.") from exc
    if not isinstance(header, dict):
        raise HTTPException(status_code=401, detail="Malformed session token.")
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature = _b64url_decode(signature_b64)
    algorithm = header.get("alg")
    if algorithm == "HS256":
        _verify_hs256(signing_input, signature, secret)
    elif algorithm == "ES256":
        _verify_es256(header, signing_input, signature)
    else:
        raise HTTPException(status_code=401, detail="Unsupported token algorithm.")
    try:
        claims = json.loads(_b64url_decode(payload_b64))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Malformed session token.") from exc
    if not isinstance(claims, dict) or not claims.get("sub"):
        raise HTTPException(status_code=401, detail="Session has no subject.")
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or float(exp) < time.time() - LEEWAY_SECONDS:
        raise HTTPException(status_code=401, detail="Session expired. Sign in again.")
    return claims


def _user_from_header(auth: str, secret: str) -> UserInfo:
    if not auth.startswith("Bearer ") or len(auth) <= 7:
        raise HTTPException(status_code=401, detail="Missing Bearer token. Sign in first.")
    claims = verify_supabase_jwt(auth[7:].strip(), secret)
    return UserInfo(user_id=str(claims["sub"]), email=str(claims.get("email", "")))


def get_current_user(request: Request) -> UserInfo | None:
    """Requires a valid session whenever SUPABASE_JWT_SECRET is configured."""
    secret = get_settings().supabase_jwt_secret
    if not secret:
        return None
    return _user_from_header(request.headers.get("Authorization", ""), secret)


def get_optional_user(request: Request) -> UserInfo | None:
    """Anonymous callers are allowed; a token that is sent must still be valid."""
    secret = get_settings().supabase_jwt_secret
    auth = request.headers.get("Authorization", "")
    if not secret or not auth:
        return None
    return _user_from_header(auth, secret)
