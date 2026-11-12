"""Cache (Redis if configured, else in-memory TTL) and blob storage (local/S3)."""

import json
import os
import time
from typing import Any

from app.config import get_settings
from app.logging import get_logger

log = get_logger("storage")

MEMORY_CACHE_MAX_ENTRIES = 1024
_memory_cache: dict[str, tuple[float, str]] = {}
_redis_client = None


def _redis():
    global _redis_client
    settings = get_settings()
    if not settings.redis_url:
        return None
    if _redis_client is not None:
        return _redis_client
    try:
        import redis

        _redis_client = redis.Redis.from_url(settings.redis_url, socket_timeout=5)
        _redis_client.ping()
        return _redis_client
    except Exception as exc:  # noqa: BLE001 - optional backend
        log.warning("redis unavailable, using memory cache: %s", exc)
        return None


def cache_get(key: str) -> str | None:
    client = _redis()
    if client is not None:
        try:
            value = client.get(f"origin:{key}")
            return value.decode() if value else None
        except Exception:  # noqa: BLE001
            return None
    entry = _memory_cache.get(key)
    if not entry:
        return None
    expires, value = entry
    if time.time() > expires:
        _memory_cache.pop(key, None)
        return None
    return value


def cache_set(key: str, value: str, ttl_seconds: int) -> None:
    client = _redis()
    if client is not None:
        try:
            client.setex(f"origin:{key}", ttl_seconds, value)
            return
        except Exception:  # noqa: BLE001
            pass
    _bound_memory_cache()
    _memory_cache[key] = (time.time() + ttl_seconds, value)


def _bound_memory_cache() -> None:
    if len(_memory_cache) < MEMORY_CACHE_MAX_ENTRIES:
        return
    now = time.time()
    for stale in [k for k, (expires, _) in _memory_cache.items() if expires < now]:
        del _memory_cache[stale]
    while len(_memory_cache) >= MEMORY_CACHE_MAX_ENTRIES:
        del _memory_cache[min(_memory_cache, key=lambda k: _memory_cache[k][0])]


def cache_get_json(key: str) -> Any | None:
    raw = cache_get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


def cache_set_json(key: str, value: Any, ttl_seconds: int) -> None:
    cache_set(key, json.dumps(value, default=str), ttl_seconds)


def storage_root() -> str:
    settings = get_settings()
    root = settings.local_storage_dir
    os.makedirs(root, exist_ok=True)
    return root


def _local_path(key: str) -> str:
    if not key or "\x00" in key or key.startswith("s3://") or os.path.isabs(key):
        raise ValueError(f"Invalid storage key: {key!r}")
    root = os.path.realpath(storage_root())
    path = os.path.realpath(os.path.join(root, key))
    if path == root or os.path.commonpath([root, path]) != root:
        raise ValueError(f"Storage key escapes the storage root: {key!r}")
    return path


def storage_put(key: str, data: bytes) -> str:
    """Store bytes. Returns the storage key. S3 when configured, else local disk."""
    settings = get_settings()
    if settings.storage_backend == "s3":
        try:
            import boto3  # type: ignore[import-untyped]

            client = boto3.client(
                "s3",
                endpoint_url=settings.s3_endpoint_url,
                aws_access_key_id=settings.s3_access_key,
                aws_secret_access_key=settings.s3_secret_key,
                region_name=settings.s3_region,
            )
            client.put_object(Bucket=settings.s3_bucket, Key=key, Body=data)
            return f"s3://{settings.s3_bucket}/{key}"
        except Exception as exc:  # noqa: BLE001
            log.warning("s3 put failed, falling back to local: %s", exc)
    path = _local_path(key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(data)
    return key


def storage_get(key: str) -> bytes:
    if key.startswith("s3://"):
        raise FileNotFoundError("S3 retrieval requires bucket access configuration")
    with open(_local_path(key), "rb") as fh:
        return fh.read()


def storage_exists(key: str) -> bool:
    if key.startswith("s3://"):
        return False
    try:
        return os.path.exists(_local_path(key))
    except ValueError:
        return False
