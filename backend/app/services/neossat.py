"""CSA NEOSSat coverage of a sky position, from the CADC TAP service (CAOM2).

NEOSSat is a pointed optical telescope, so it only covers the fields it was aimed at. This module
answers "did NEOSSat observe here, how often and when" and links to CADC; it never downloads data.
"""

import csv
import io
from typing import Any

import httpx

from app.config import get_settings
from app.services.catalogs import CatalogUnavailable
from app.services.store import cache_get_json, cache_set_json

COLLECTION = "NEOSSAT"
COLLECTION_URL = "https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/neossat"


def _mjd_to_date(value: str) -> str | None:
    if not value:
        return None
    from astropy.time import Time  # type: ignore[import-untyped]

    return str(Time(float(value), format="mjd").to_value("iso", "date"))


def query_coverage(
    ra: float, dec: float, radius_deg: float, transport: httpx.BaseTransport | None = None
) -> dict[str, Any]:
    settings = get_settings()
    query = (
        "SELECT COUNT(*) AS nobs, MIN(p.time_bounds_lower) AS tmin, MAX(p.time_bounds_lower) AS tmax "
        "FROM caom2.Observation AS o JOIN caom2.Plane AS p ON o.obsID = p.obsID "
        f"WHERE o.collection = '{COLLECTION}' "
        f"AND INTERSECTS(CIRCLE('ICRS', {ra:.6f}, {dec:.6f}, {radius_deg:.6f}), p.position_bounds) = 1"
    )
    try:
        with httpx.Client(transport=transport, timeout=settings.catalog_timeout_seconds, follow_redirects=True) as client:
            response = client.get(
                settings.cadc_tap_url.rstrip("/") + "/sync",
                params={"LANG": "ADQL", "FORMAT": "csv", "QUERY": query},
            )
        response.raise_for_status()
        rows = list(csv.DictReader(io.StringIO(response.text)))
        row = rows[0]
        count = int(row["nobs"])
        first, last = _mjd_to_date(row["tmin"]), _mjd_to_date(row["tmax"])
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        raise CatalogUnavailable("CADC query failed") from exc
    return {
        "archive": "CADC",
        "collection": COLLECTION,
        "count": count,
        "first_date": first,
        "last_date": last,
        "radius_deg": radius_deg,
        "collection_url": COLLECTION_URL,
    }


def neossat_coverage(ra: float, dec: float, radius_deg: float = 0.25) -> dict[str, Any]:
    key = f"neossat:{ra:.4f}:{dec:.4f}:{radius_deg:.3f}"
    cached = cache_get_json(key)
    if cached is not None:
        return cached
    result = query_coverage(ra, dec, radius_deg)
    cache_set_json(key, result, get_settings().catalog_cache_ttl_seconds)
    return result
