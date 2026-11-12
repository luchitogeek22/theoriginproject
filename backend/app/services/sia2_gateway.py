"""SPHEREx data gateway: IVOA SIA2 queries against NASA/IPAC IRSA.

One plain-HTTP path (httpx) with connect/read timeouts, a total deadline per search,
a bounded retry for transient failures and a cache keyed by every query parameter.

Nothing is ever simulated: every item carries its collection, product id, access_url
and query timestamp.
"""

import csv
import hashlib
import io
import random
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import urljoin, urlsplit

import httpx

from app.config import get_settings
from app.logging import get_logger
from app.services.store import cache_get_json, cache_set_json

log = get_logger("sia2")

FIELD_MAP = {
    "obs_id": ("obs_id", "obsid"),
    "product_id": ("obs_publisher_did",),
    "collection": ("obs_collection", "collection"),
    "ra": ("s_ra", "ra", "center_ra"),
    "dec": ("s_dec", "dec", "center_dec"),
    "fov": ("s_fov", "fov"),
    "t_min": ("t_min", "tmin"),
    "t_max": ("t_max", "tmax"),
    "instrument": ("instrument_name", "instrument"),
    "bandpass_name": ("energy_bandpassname",),
    "em_min": ("em_min",),
    "em_max": ("em_max",),
    "dataproduct_type": ("dataproduct_type", "producttype"),
    "access_url": ("access_url", "accessurl", "download_url"),
    "access_format": ("access_format", "format"),
    "filesize": ("access_estsize", "filesize", "size"),
    "s_region": ("s_region", "region"),
}

MJD_UNIX_EPOCH = 40587.0
RETRY_STATUS = (502, 503, 504)
CONNECTION_ERRORS = (httpx.ConnectError, httpx.ConnectTimeout, httpx.RemoteProtocolError)


def _pick(row: dict[str, Any], key: str) -> Any:
    lowered = {str(k).lower(): v for k, v in row.items()}
    for candidate in FIELD_MAP[key]:
        if candidate in lowered:
            value = lowered[candidate]
            if value not in (None, ""):
                return value
    return None


def _to_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _detector(bandpass_name: Any) -> int | None:
    match = re.search(r"D([1-6])\b", str(bandpass_name or ""))
    return int(match.group(1)) if match else None


def _mjd_to_iso(mjd: float | None) -> str:
    if mjd is None:
        return ""
    moment = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(days=mjd - MJD_UNIX_EPOCH)
    return moment.isoformat()


def build_sia2_params(
    ra_deg: float,
    dec_deg: float,
    radius_deg: float,
    collection: str,
    maxrec: int,
    t_min_mjd: float | None = None,
    t_max_mjd: float | None = None,
    response_format: str = "csv",
) -> dict[str, str]:
    """Documented SIA2 parameter set (IRSA). Pure function — unit tested."""
    params = {
        "COLLECTION": collection,
        "POS": f"CIRCLE {ra_deg:.6f} {dec_deg:.6f} {radius_deg:.6f}",
        "RESPONSEFORMAT": response_format,
        "MAXREC": str(maxrec),
    }
    if t_min_mjd is not None or t_max_mjd is not None:
        lo = f"{t_min_mjd:.6f}" if t_min_mjd is not None else "-Inf"
        hi = f"{t_max_mjd:.6f}" if t_max_mjd is not None else "+Inf"
        params["TIME"] = f"{lo} {hi}"
    return params


def normalize_row(row: dict[str, Any], collection: str, queried_at: str) -> dict[str, Any]:
    obs_id = str(_pick(row, "obs_id") or "")
    access_url = str(_pick(row, "access_url") or "")
    detector = _detector(_pick(row, "bandpass_name"))
    product_id = str(_pick(row, "product_id") or "") or f"{collection}:{obs_id}:{detector or ''}"
    t_min = _to_float(_pick(row, "t_min"))
    em_min = _to_float(_pick(row, "em_min"))
    em_max = _to_float(_pick(row, "em_max"))
    wave_min = em_min * 1e6 if em_min is not None else None
    wave_max = em_max * 1e6 if em_max is not None else None
    band = f"{wave_min:.2f}-{wave_max:.2f} um" if wave_min is not None and wave_max is not None else ""
    return {
        "obs_id": obs_id,
        "product_id": product_id,
        "collection": str(_pick(row, "collection") or collection),
        "ra_deg": _to_float(_pick(row, "ra")),
        "dec_deg": _to_float(_pick(row, "dec")),
        "fov_deg": _to_float(_pick(row, "fov")),
        "t_min_mjd": t_min,
        "t_max_mjd": _to_float(_pick(row, "t_max")),
        "date_obs": _mjd_to_iso(t_min),
        "instrument": str(_pick(row, "instrument") or ""),
        "detector": detector,
        "band": band,
        "wave_min_um": wave_min,
        "wave_max_um": wave_max,
        "dataproduct_type": str(_pick(row, "dataproduct_type") or ""),
        "access_url": access_url,
        "access_format": str(_pick(row, "access_format") or ""),
        "filesize_bytes": _to_int(_pick(row, "filesize")),
        "s_region": str(_pick(row, "s_region") or ""),
        "provenance": {
            "source": "NASA/IPAC IRSA",
            "collection": collection,
            "obs_id": obs_id,
            "access_url": access_url,
            "queried_at": queried_at,
            "cached": False,
            "data_class": "OBSERVED_DATA",
        },
    }


def query_hash(
    ra: float,
    dec: float,
    radius_arcmin: float,
    collections: list[str],
    t_min_mjd: float | None = None,
    t_max_mjd: float | None = None,
    maxrec: int | None = None,
    service_url: str = "",
) -> str:
    raw = (
        f"{ra:.5f}|{dec:.5f}|{radius_arcmin:.3f}|{','.join(sorted(collections))}"
        f"|{t_min_mjd}|{t_max_mjd}|{maxrec}|{service_url}"
    )
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


_DISCOVERY: dict[str, Any] = {}
_DISCOVERY_LOCK = threading.Lock()


def reset_discovery() -> None:
    with _DISCOVERY_LOCK:
        _DISCOVERY.clear()


class ArchiveUnavailableError(RuntimeError):
    pass


class InvalidCollectionError(ValueError):
    pass


class DownloadTooLargeError(ValueError):
    pass


class _TransientDownloadError(Exception):
    pass


class DisallowedDownloadError(ValueError):
    pass


MAX_DOWNLOAD_REDIRECTS = 5


def check_download_url(url: str, allowed_suffixes: list[str]) -> None:
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError as exc:
        raise DisallowedDownloadError(f"Malformed download URL: {exc}") from exc
    host = (parts.hostname or "").lower().rstrip(".")
    if parts.scheme != "https" or not host or port not in (None, 443):
        raise DisallowedDownloadError("Downloads must use https on the default port.")
    if not any(host == s or host.endswith("." + s) for s in allowed_suffixes):
        raise DisallowedDownloadError(f"Host not allowed for downloads: {host}")


class SPHERExDataGateway:
    def __init__(
        self,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
        monotonic: Callable[[], float] | None = None,
    ) -> None:
        self.settings = get_settings()
        self._transport = transport
        self._sleep = sleep
        self._monotonic = monotonic or time.monotonic
        self._download_slots = threading.BoundedSemaphore(max(1, self.settings.download_concurrency))

    def collection_info(self, wait: bool = False) -> dict[str, Any]:
        """Collections to search: discovered from IRSA when known, the configured list otherwise.

        The discovery query is slow (about a minute), so requests never wait for it: they get the
        last known answer, or the configured fallback while a background refresh runs.
        """
        settings = self.settings
        configured = settings.collection_list
        fallback = {"used": configured, "source": "configured", "checked_at": ""}
        if not settings.discover_collections:
            return fallback
        with _DISCOVERY_LOCK:
            entry = _DISCOVERY.get(settings.irsa_tap_url)
            if entry and time.time() < entry["expires"]:
                return entry["info"]
            stale = entry["info"] if entry else fallback
            running = _DISCOVERY.get("_running")
        if wait:
            return self._refresh(configured)
        if not running:
            with _DISCOVERY_LOCK:
                _DISCOVERY["_running"] = True
            threading.Thread(target=self._refresh, args=(configured,), daemon=True).start()
        return stale

    def _refresh(self, configured: list[str]) -> dict[str, Any]:
        try:
            info = self._discover(configured)
            ttl = (
                self.settings.collection_discovery_ttl_seconds
                if info["source"] == "irsa"
                else self.settings.collection_discovery_retry_seconds
            )
            with _DISCOVERY_LOCK:
                _DISCOVERY[self.settings.irsa_tap_url] = {"info": info, "expires": time.time() + ttl}
            return info
        finally:
            with _DISCOVERY_LOCK:
                _DISCOVERY.pop("_running", None)

    def _discover(self, configured: list[str]) -> dict[str, Any]:
        checked_at = datetime.now(timezone.utc).isoformat()
        try:
            timeout = httpx.Timeout(
                self.settings.collection_discovery_timeout_seconds,
                connect=self.settings.irsa_connect_timeout_seconds,
            )
            with self._client(timeout) as client:
                response = client.post(
                    self.settings.irsa_tap_url,
                    data={
                        "QUERY": "SELECT obs_collection, MAX(t_max) AS tmax FROM spherex.obscore "
                        "GROUP BY obs_collection",
                        "LANG": "ADQL",
                        "FORMAT": "csv",
                    },
                )
                response.raise_for_status()
            rows = list(csv.DictReader(io.StringIO(response.text)))
            found = [
                (r["obs_collection"], _to_float(r.get("tmax")))
                for r in rows
                if str(r.get("obs_collection", "")).startswith("spherex_")
                and not str(r["obs_collection"]).endswith("_cal")
                and _to_float(r.get("tmax")) is not None
            ]
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            log.warning("collection discovery failed: %s", exc)
            return {"used": configured, "source": "configured", "checked_at": checked_at}
        if not found:
            return {"used": configured, "source": "configured", "checked_at": checked_at}
        found.sort(key=lambda item: item[1], reverse=True)
        return {"used": [name for name, _ in found], "source": "irsa", "checked_at": checked_at}

    def available_collections(self) -> list[str]:
        return self.collection_info()["used"]

    def _client(self, timeout: httpx.Timeout | float, follow_redirects: bool = True) -> httpx.Client:
        extra: dict[str, Any] = {"transport": self._transport} if self._transport else {}
        return httpx.Client(timeout=timeout, follow_redirects=follow_redirects, **extra)

    def search(
        self,
        ra_deg: float,
        dec_deg: float,
        radius_arcmin: float,
        collections: list[str] | None = None,
        t_min_mjd: float | None = None,
        t_max_mjd: float | None = None,
        maxrec: int | None = None,
    ) -> dict[str, Any]:
        configured = self.available_collections()
        cols = collections or configured
        unknown = [c for c in cols if c not in configured]
        if unknown:
            raise InvalidCollectionError(
                f"Unknown collection(s): {', '.join(unknown)}. Available: {', '.join(configured)}"
            )
        maxrec = maxrec or self.settings.irsa_maxrec
        key = "sia:" + query_hash(
            ra_deg, dec_deg, radius_arcmin, cols, t_min_mjd, t_max_mjd, maxrec,
            self.settings.irsa_sia2_url,
        )
        cached = cache_get_json(key)
        if cached is not None:
            if "unavailable" in cached:
                raise ArchiveUnavailableError(cached["unavailable"])
            cached["cached"] = True
            for item in cached.get("items", []):
                (item.get("provenance") or {})["cached"] = True
            return cached

        radius_deg = radius_arcmin / 60.0
        queried_at = datetime.now(timezone.utc).isoformat()
        deadline = self._monotonic() + self.settings.irsa_search_deadline_seconds
        items: list[dict[str, Any]] = []
        seen: set[str] = set()
        warnings: list[str] = []
        errors: list[str] = []
        for collection in cols:
            try:
                rows = self._query_collection(
                    collection, ra_deg, dec_deg, radius_deg, t_min_mjd, t_max_mjd, maxrec, deadline
                )
            except ArchiveUnavailableError as exc:
                log.warning("collection %s failed: %s", collection, exc)
                errors.append(f"{collection}: {exc}")
                continue
            if len(rows) >= maxrec:
                warnings.append(
                    f"{collection} returned {len(rows)} rows, equal to maxrec; "
                    "older or additional exposures may be missing."
                )
            for row in rows:
                item = normalize_row(row, collection, queried_at)
                if item["product_id"] in seen:
                    continue
                seen.add(item["product_id"])
                items.append(item)
        if not items and errors and len(errors) == len(cols):
            message = "IRSA did not answer for any collection: " + "; ".join(errors)
            cache_set_json(key, {"unavailable": message}, self.settings.sia_negative_ttl_seconds)
            raise ArchiveUnavailableError(message)
        ttl = self.settings.sia_cache_ttl_seconds
        if errors:
            warnings.append("Some collections failed: " + "; ".join(errors))
            ttl = min(ttl, self.settings.sia_partial_ttl_seconds)
        payload = {
            "count": len(items),
            "items": items,
            "queried_at": queried_at,
            "cached": False,
            "collections_queried": cols,
            "warnings": warnings,
        }
        cache_set_json(key, payload, ttl)
        return payload

    def _query_collection(
        self,
        collection: str,
        ra: float,
        dec: float,
        radius_deg: float,
        t_min: float | None,
        t_max: float | None,
        maxrec: int,
        deadline: float,
    ) -> list[dict[str, Any]]:
        params = build_sia2_params(ra, dec, radius_deg, collection, maxrec, t_min, t_max)
        text = self._get(params, deadline)
        if "<VOTABLE" in text[:100000].upper():
            return self._parse_votable(text)
        return self._parse_csv(text)

    def _get(self, params: dict[str, str], deadline: float) -> str:
        last: Exception | str = ""
        for attempt in range(2):
            remaining = deadline - self._monotonic()
            if remaining <= 0:
                raise ArchiveUnavailableError("search deadline exceeded")
            timeout = httpx.Timeout(
                min(self.settings.irsa_timeout_seconds, remaining),
                connect=min(self.settings.irsa_connect_timeout_seconds, remaining),
            )
            try:
                with self._client(timeout) as client:
                    response = client.get(self.settings.irsa_sia2_url, params=params)
            except CONNECTION_ERRORS as exc:
                last = exc
            except httpx.HTTPError as exc:
                raise ArchiveUnavailableError(f"IRSA request failed: {exc}") from exc
            else:
                if response.status_code not in RETRY_STATUS:
                    try:
                        response.raise_for_status()
                    except httpx.HTTPStatusError as exc:
                        raise ArchiveUnavailableError(f"IRSA request failed: {exc}") from exc
                    return response.text
                last = f"HTTP {response.status_code}"
            if attempt == 0:
                self._sleep(random.uniform(0.5, 1.5))
        raise ArchiveUnavailableError(f"IRSA request failed after retry: {last}")

    @staticmethod
    def _parse_csv(text: str) -> list[dict[str, Any]]:
        lines = [line for line in text.splitlines() if line.strip()]
        if not lines:
            return []
        reader = csv.DictReader(io.StringIO("\n".join(lines)))
        rows = []
        for row in reader:
            row.pop(None, None)
            rows.append(dict(row))
        return rows

    @staticmethod
    def _parse_votable(text: str) -> list[dict[str, Any]]:
        from astropy.io.votable import parse_single_table  # type: ignore[import-untyped]

        table = parse_single_table(io.BytesIO(text.encode())).to_table()
        rows: list[dict[str, Any]] = []
        for record in table:
            row = {}
            for name in table.colnames:
                value = record[name]
                row[name] = value.tolist() if hasattr(value, "tolist") else value
            rows.append(row)
        return rows

    def ping(self) -> dict[str, Any]:
        """Lightweight availability probe: MAXREC=1 over a fixed test position."""
        started = time.monotonic()
        checked_at = datetime.now(timezone.utc).isoformat()
        try:
            params = build_sia2_params(10.0, 10.0, 0.05, "spherex_qr3", 1)
            with self._client(10.0) as client:
                response = client.get(self.settings.irsa_sia2_url, params=params)
                response.raise_for_status()
            latency = int((time.monotonic() - started) * 1000)
            return {
                "name": "IRSA SIA2 (SPHEREx)",
                "reachable": True,
                "latency_ms": latency,
                "detail": f"HTTP {response.status_code}",
                "checked_at": checked_at,
            }
        except Exception as exc:  # noqa: BLE001 - probe must never raise
            return {
                "name": "IRSA SIA2 (SPHEREx)",
                "reachable": False,
                "latency_ms": None,
                "detail": str(exc),
                "checked_at": checked_at,
            }

    def download(self, url: str, dest_hint: str = "") -> tuple[bytes, str]:
        """Download a file or cutout under a size cap, paced, retrying transient failures."""
        suffixes = self.settings.download_host_suffix_list
        check_download_url(url, suffixes)
        label = dest_hint or url
        attempts = max(1, self.settings.download_max_attempts)
        with self._download_slots:
            try:
                for attempt in range(attempts):
                    try:
                        return self._download_once(url, suffixes, label)
                    except _TransientDownloadError as exc:
                        if attempt == attempts - 1:
                            raise ArchiveUnavailableError(
                                f"Download failed for {label} after {attempts} attempts: {exc}"
                            ) from exc
                        wait = min(
                            self.settings.download_backoff_cap_seconds,
                            self.settings.download_backoff_seconds * 2**attempt,
                        )
                        self._sleep(wait + random.uniform(0, 1))
                raise AssertionError("unreachable")
            finally:
                self._sleep(self.settings.download_pause_seconds)

    def _download_once(self, url: str, suffixes: list[str], label: str) -> tuple[bytes, str]:
        limit = self.settings.download_limit_mb * 1024 * 1024
        try:
            with self._client(self.settings.irsa_timeout_seconds, follow_redirects=False) as client:
                current = url
                for _ in range(MAX_DOWNLOAD_REDIRECTS + 1):
                    with client.stream("GET", current) as response:
                        if response.is_redirect:
                            current = urljoin(str(response.url), response.headers["location"])
                            check_download_url(current, suffixes)
                            continue
                        if response.status_code in RETRY_STATUS:
                            raise _TransientDownloadError(f"HTTP {response.status_code}")
                        response.raise_for_status()
                        declared = response.headers.get("content-length", "")
                        if declared.isdigit() and int(declared) > limit:
                            raise DownloadTooLargeError(
                                f"{label} declares {int(declared)} bytes; "
                                f"limit is {self.settings.download_limit_mb} MB"
                            )
                        chunks: list[bytes] = []
                        total = 0
                        for chunk in response.iter_bytes(1024 * 256):
                            total += len(chunk)
                            if total > limit:
                                raise DownloadTooLargeError(
                                    f"Download exceeds {self.settings.download_limit_mb} MB limit"
                                )
                            chunks.append(chunk)
                        return b"".join(chunks), str(response.url)
                raise ArchiveUnavailableError(f"Too many redirects downloading {label}")
        except CONNECTION_ERRORS as exc:
            raise _TransientDownloadError(str(exc)) from exc
        except httpx.HTTPError as exc:
            raise ArchiveUnavailableError(f"Download failed for {label}: {exc}") from exc
