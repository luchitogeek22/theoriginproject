"""External catalogues: Gaia DR3 (cone search) and IMCCE SkyBoT (known solar-system bodies).

Every call has a total deadline and a per-field cache; failures raise CatalogUnavailable so callers
degrade honestly instead of guessing.
"""

from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from typing import Any

from app.config import get_settings
from app.logging import get_logger
from app.services.store import cache_get_json, cache_set_json
from app.services.targets import propagate

log = get_logger("catalogs")

GAIA_EPOCH = "J2016.0"


class CatalogUnavailable(RuntimeError):
    pass


def _with_deadline(func, *args, seconds: float):
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(func, *args)
    try:
        return future.result(timeout=seconds)
    except FutureTimeout as exc:
        raise CatalogUnavailable("catalogue did not answer in time") from exc
    except Exception as exc:  # noqa: BLE001
        log.warning("catalogue query failed: %s", exc)
        raise CatalogUnavailable("catalogue query failed") from exc
    finally:
        executor.shutdown(wait=False)


def _gaia_query(ra: float, dec: float, radius_deg: float, g_limit: float, row_limit: int):
    from astroquery.gaia import Gaia  # type: ignore[import-untyped]

    adql = (
        f"SELECT TOP {int(row_limit)} source_id, ra, dec, pmra, pmdec, parallax, "
        "phot_g_mean_mag, phot_variable_flag FROM gaiadr3.gaia_source "
        f"WHERE 1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', {ra:.6f}, {dec:.6f}, {radius_deg:.6f})) "
        f"AND phot_g_mean_mag < {g_limit:.2f} ORDER BY phot_g_mean_mag"
    )
    table = Gaia.launch_job(adql).get_results()
    rows = []
    for row in table:
        rows.append({
            "source_id": int(row["source_id"]),
            "ra": float(row["ra"]),
            "dec": float(row["dec"]),
            "pmra": float(row["pmra"]) if row["pmra"] == row["pmra"] else 0.0,
            "pmdec": float(row["pmdec"]) if row["pmdec"] == row["pmdec"] else 0.0,
            "parallax": float(row["parallax"]) if row["parallax"] == row["parallax"] else None,
            "g_mag": float(row["phot_g_mean_mag"]),
            "variable": str(row["phot_variable_flag"]).strip().upper() == "VARIABLE",
        })
    return rows


def gaia_cone(
    ra: float, dec: float, radius_deg: float, g_limit: float = 18.0, row_limit: int = 300
) -> list[dict[str, Any]]:
    key = f"gaia:{ra:.3f}:{dec:.3f}:{radius_deg:.3f}:{g_limit:.1f}:{row_limit}"
    cached = cache_get_json(key)
    if cached is not None:
        return cached
    rows = _with_deadline(
        _gaia_query, ra, dec, radius_deg, g_limit, row_limit,
        seconds=get_settings().catalog_timeout_seconds,
    )
    cache_set_json(key, rows, get_settings().catalog_cache_ttl_seconds)
    return rows


def gaia_position_at(star: dict[str, Any], mjd: float) -> tuple[float, float]:
    from astropy.time import Time

    return propagate(
        star["ra"], star["dec"], star["pmra"], star["pmdec"], star.get("parallax"),
        GAIA_EPOCH, Time(mjd, format="mjd"),
    )


def _skybot_query(ra: float, dec: float, radius_arcsec: float, mjd: float):
    from astropy import units as u
    from astropy.coordinates import SkyCoord
    from astropy.time import Time
    from astroquery.imcce import Skybot  # type: ignore[import-untyped]

    table = Skybot.cone_search(
        SkyCoord(ra * u.deg, dec * u.deg), radius_arcsec * u.arcsec, Time(mjd, format="mjd")
    )
    return [
        {"name": str(row["Name"]), "ra": float(row["RA"].to(u.deg).value) if hasattr(row["RA"], "to") else float(row["RA"]),
         "dec": float(row["DEC"].to(u.deg).value) if hasattr(row["DEC"], "to") else float(row["DEC"])}
        for row in table
    ]


def skybot_cone(ra: float, dec: float, radius_arcsec: float, mjd: float) -> list[dict[str, Any]]:
    key = f"skybot:{ra:.4f}:{dec:.4f}:{radius_arcsec:.1f}:{mjd:.2f}"
    cached = cache_get_json(key)
    if cached is not None:
        return cached
    rows = _with_deadline(
        _skybot_query, ra, dec, radius_arcsec, mjd, seconds=get_settings().catalog_timeout_seconds
    )
    cache_set_json(key, rows, get_settings().catalog_cache_ttl_seconds)
    return rows
