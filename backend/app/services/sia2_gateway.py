"""SPHEREx data gateway: IVOA SIA2 queries against NASA/IPAC IRSA.

Primary path uses PyVO's SIA2 service. If PyVO is unavailable or the service
answers in a way PyVO cannot parse, the gateway falls back to a documented
plain-HTTP SIA2 GET (same parameters) and parses CSV/VOTable itself.

Nothing is ever simulated: every item carries its collection, obs_id,
access_url and query timestamp.
"""

import csv
import hashlib
import io
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx

from app.config import get_settings
from app.logging import get_logger
from app.services.store import cache_get_json, cache_set_json

log = get_logger("sia2")

FIELD_MAP = {
    "obs_id": ("obs_id", "obsid", "obsID", "obs_publisher_did"),
    "collection": ("obs_collection", "collection"),
    "ra": ("s_ra", "ra", "center_ra"),
    "dec": ("s_dec", "dec", "center_dec"),
    "fov": ("s_fov", "fov"),
    "t_min": ("t_min", "mjd_obs", "tmin"),
    "t_max": ("t_max", "tmax"),
    "date_obs": ("date_obs", "obs_date", "t_obs"),
    "instrument": ("instrument_name", "instrument"),
    "detector": ("detector", "detname", "det"),
    "band": ("band", "em_band", "filter"),
    "dataproduct_type": ("dataproduct_type", "producttype"),
    "access_url": ("access_url", "accessurl", "download_url"),
    "access_format": ("access_format", "format"),
    "filesize": ("access_estsize", "filesize", "size"),
    "s_region": ("s_region", "region"),
}


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
        lo = f"{t_min_mjd:.6f}" if t_min_mjd is not None else ""
        hi = f"{t_max_mjd:.6f}" if t_max_mjd is not None else ""
        params["TIME"] = f"{lo} {hi}".strip()
    return params


def normalize_row(row: dict[str, Any], collection: str, queried_at: str) -> dict[str, Any]:
    obs_id = str(_pick(row, "obs_id") or "")
    access_url = str(_pick(row, "access_url") or "")
    return {
        "obs_id": obs_id,
        "collection": str(_pick(row, "collection") or collection),
        "ra_deg": _to_float(_pick(row, "ra")),
        "dec_deg": _to_float(_pick(row, "dec")),
        "fov_deg": _to_float(_pick(row, "fov")),
        "t_min_mjd": _to_float(_pick(row, "t_min")),
        "t_max_mjd": _to_float(_pick(row, "t_max")),
        "date_obs": str(_pick(row, "date_obs") or ""),
        "instrument": str(_pick(row, "instrument") or ""),
        "detector": str(_pick(row, "detector") or ""),
        "band": str(_pick(row, "band") or ""),
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


def query_hash(ra: float, dec: float, radius_arcmin: float, collections: list[str]) -> str:
    raw = f"{ra:.5f}|{dec:.5f}|{radius_arcmin:.3f}|{','.join(sorted(collections))}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


class ArchiveUnavailableError(RuntimeError):
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
    def __init__(self) -> None:
        self.settings = get_settings()

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
        cols = collections or self.settings.collection_list
        maxrec = maxrec or self.settings.irsa_maxrec
        key = "sia:" + query_hash(ra_deg, dec_deg, radius_arcmin, cols)
        cached = cache_get_json(key)
        if cached is not None:
            cached["cached"] = True
            for item in cached.get("items", []):
                prov = item.get("provenance") or {}
                prov["cached"] = True
            return cached

        radius_deg = radius_arcmin / 60.0
        queried_at = datetime.now(timezone.utc).isoformat()
        items: list[dict[str, Any]] = []
        warnings: list[str] = []
        errors: list[str] = []
        for collection in cols:
            try:
                rows = self._query_collection(
                    collection, ra_deg, dec_deg, radius_deg, t_min_mjd, t_max_mjd, maxrec
                )
            except Exception as exc:  # noqa: BLE001 - per-collection errors are reported
                log.warning("collection %s failed: %s", collection, exc)
                errors.append(f"{collection}: {exc}")
                continue
            for row in rows:
                items.append(normalize_row(row, collection, queried_at))
        if not items and errors and len(errors) == len(cols):
            raise ArchiveUnavailableError(
                "IRSA did not answer for any collection: " + "; ".join(errors)
            )
        if errors:
            warnings.append("Some collections failed: " + "; ".join(errors))
        payload = {
            "count": len(items),
            "items": items,
            "queried_at": queried_at,
            "cached": False,
            "collections_queried": cols,
            "warnings": warnings,
        }
        cache_set_json(key, payload, self.settings.sia_cache_ttl_seconds)
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
    ) -> list[dict[str, Any]]:
        try:
            return self._query_pyvo(collection, ra, dec, radius_deg, t_min, t_max, maxrec)
        except Exception as exc:  # noqa: BLE001 - documented HTTP fallback
            log.info("pyvo path failed for %s (%s); using HTTP SIA2", collection, exc)
            return self._query_http(collection, ra, dec, radius_deg, t_min, t_max, maxrec)

    def _query_pyvo(
        self,
        collection: str,
        ra: float,
        dec: float,
        radius_deg: float,
        t_min: float | None,
        t_max: float | None,
        maxrec: int,
    ) -> list[dict[str, Any]]:
        from pyvo.dal import sia2  # type: ignore[import-untyped]

        service = sia2.SIA2Service(self.settings.irsa_sia2_url)
        kwargs: dict[str, Any] = {"collection": collection, "maxrec": maxrec}
        if t_min is not None or t_max is not None:
            kwargs["time"] = (t_min, t_max)
        results = service.search((ra, dec, radius_deg, "deg"), **kwargs)
        rows: list[dict[str, Any]] = []
        for record in results:
            row = {}
            for key in record.keys():
                try:
                    value = record[key]
                except Exception:  # noqa: BLE001
                    continue
                if hasattr(value, "tolist"):
                    value = value.tolist()
                row[str(key)] = value
            rows.append(row)
        return rows

    def _query_http(
        self,
        collection: str,
        ra: float,
        dec: float,
        radius_deg: float,
        t_min: float | None,
        t_max: float | None,
        maxrec: int,
    ) -> list[dict[str, Any]]:
        params = build_sia2_params(ra, dec, radius_deg, collection, maxrec, t_min, t_max)
        try:
            with httpx.Client(timeout=self.settings.irsa_timeout_seconds) as client:
                response = client.get(self.settings.irsa_sia2_url, params=params)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ArchiveUnavailableError(f"IRSA request failed: {exc}") from exc
        text = response.text
        if "<VOTABLE" in text[:100000].upper():
            return self._parse_votable(text)
        return self._parse_csv(text)

    @staticmethod
    def _parse_csv(text: str) -> list[dict[str, Any]]:
        lines = [line for line in text.splitlines() if line.strip()]
        if not lines:
            return []
        reader = csv.DictReader(io.StringIO("\n".join(lines)))
        return [dict(row) for row in reader]

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
            with httpx.Client(timeout=10.0) as client:
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
        """Download a file or cutout with size limits. Returns (bytes, final_url)."""
        suffixes = self.settings.download_host_suffix_list
        check_download_url(url, suffixes)
        limit = self.settings.download_limit_mb * 1024 * 1024
        try:
            with httpx.Client(
                timeout=self.settings.irsa_timeout_seconds, follow_redirects=False
            ) as client:
                current = url
                for _ in range(MAX_DOWNLOAD_REDIRECTS + 1):
                    with client.stream("GET", current) as response:
                        if response.is_redirect:
                            current = urljoin(str(response.url), response.headers["location"])
                            check_download_url(current, suffixes)
                            continue
                        response.raise_for_status()
                        chunks: list[bytes] = []
                        total = 0
                        for chunk in response.iter_bytes(1024 * 256):
                            total += len(chunk)
                            if total > limit:
                                raise ValueError(
                                    f"Download exceeds {self.settings.download_limit_mb} MB limit"
                                )
                            chunks.append(chunk)
                        return b"".join(chunks), str(response.url)
                raise ArchiveUnavailableError(
                    f"Too many redirects downloading {dest_hint or url}"
                )
        except httpx.HTTPError as exc:
            raise ArchiveUnavailableError(f"Download failed for {dest_hint or url}: {exc}") from exc
