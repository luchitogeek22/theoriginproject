"""Target resolution: offline test targets, free-text coordinates, SIMBAD for other names."""

import json
import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import date, datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.logging import get_logger

log = get_logger("targets")

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "test_targets.json"
COORDINATE_CHARS = re.compile(r"^[0-9hdms:\s.+\-°'\"]+$", re.IGNORECASE)


class ResolutionError(RuntimeError):
    pass


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


@lru_cache
def load_test_targets() -> list[dict[str, Any]]:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))["targets"]


def find_test_target(query: str) -> dict[str, Any] | None:
    wanted = _norm(query)
    for target in load_test_targets():
        names = {_norm(target["name"]), *(_norm(a) for a in target["aliases"])}
        if wanted in names:
            return target
    return None


def validate_range(ra_deg: float, dec_deg: float) -> None:
    if not (0.0 <= ra_deg < 360.0):
        raise ResolutionError(f"RA {ra_deg} is outside [0, 360) degrees.")
    if not (-90.0 <= dec_deg <= 90.0):
        raise ResolutionError(f"Dec {dec_deg} is outside [-90, 90] degrees.")


def parse_coordinates(text: str) -> tuple[float, float] | None:
    """Decimal pair or sexagesimal RA/Dec. Returns None when the text is not coordinates."""
    cleaned = text.strip()
    pair = [p for p in re.split(r"[\s,;]+", cleaned) if p]
    if len(pair) == 2:
        try:
            ra, dec = float(pair[0]), float(pair[1])
        except ValueError:
            pass
        else:
            validate_range(ra, dec)
            return ra, dec
    if not COORDINATE_CHARS.match(cleaned) or not re.search(r"\d", cleaned):
        return None
    from astropy import units as u
    from astropy.coordinates import SkyCoord

    try:
        coord = SkyCoord(cleaned, unit=(u.hourangle, u.deg))
    except (ValueError, TypeError):
        return None
    ra, dec = float(coord.ra.deg), float(coord.dec.deg)
    validate_range(ra, dec)
    return ra, dec


def _as_time(value: str | date | datetime):
    from astropy.time import Time

    if isinstance(value, date) and not isinstance(value, datetime):
        value = datetime(value.year, value.month, value.day)
    return Time(value)


def propagate(
    ra_deg: float,
    dec_deg: float,
    pmra_mas_yr: float,
    pmdec_mas_yr: float,
    parallax_mas: float | None,
    from_epoch: str | date | datetime,
    to_epoch: str | date | datetime,
) -> tuple[float, float]:
    from astropy import units as u
    from astropy.coordinates import SkyCoord

    kwargs: dict[str, Any] = {}
    if parallax_mas and parallax_mas > 0:
        kwargs["distance"] = (1000.0 / parallax_mas) * u.pc
    start = SkyCoord(
        ra=ra_deg * u.deg,
        dec=dec_deg * u.deg,
        pm_ra_cosdec=pmra_mas_yr * u.mas / u.yr,
        pm_dec=pmdec_mas_yr * u.mas / u.yr,
        obstime=_as_time(from_epoch),
        **kwargs,
    )
    moved = start.apply_space_motion(new_obstime=_as_time(to_epoch))
    return float(moved.ra.deg), float(moved.dec.deg)


class TargetResolutionService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def resolve(
        self,
        name: str | None = None,
        ra_deg: float | None = None,
        dec_deg: float | None = None,
        catalog_id: str | None = None,
        query: str | None = None,
        obstime: date | datetime | str | None = None,
    ) -> dict[str, Any]:
        if ra_deg is not None and dec_deg is not None:
            validate_range(ra_deg, dec_deg)
            return self._manual(name or catalog_id, ra_deg, dec_deg)
        text = (query or name or catalog_id or "").strip()
        if not text:
            raise ResolutionError("Provide a name, catalog id, or RA/DEC coordinates.")
        coordinates = parse_coordinates(text)
        if coordinates is not None:
            return self._manual(None, *coordinates)
        known = find_test_target(text)
        if known is not None:
            return self._from_test_target(known, obstime)
        return self._resolve_simbad(text)

    @staticmethod
    def _manual(label: str | None, ra_deg: float, dec_deg: float) -> dict[str, Any]:
        return {
            "name": label or f"Manual ({ra_deg:.5f}, {dec_deg:.5f})",
            "catalog_id": "",
            "ra_deg": float(ra_deg),
            "dec_deg": float(dec_deg),
            "frame": "ICRS",
            "epoch": "J2000",
            "resolver": "manual",
            "warning": "",
        }

    @staticmethod
    def _from_test_target(target: dict[str, Any], obstime) -> dict[str, Any]:
        when = _as_time(obstime) if obstime else _as_time(datetime.now(timezone.utc))
        p_ra, p_dec = propagate(
            target["ra_deg"],
            target["dec_deg"],
            target["pmra_mas_yr"],
            target["pmdec_mas_yr"],
            target.get("parallax_mas"),
            target["epoch"],
            when,
        )
        return {
            "name": target["name"],
            "catalog_id": target["catalog_id"],
            "ra_deg": target["ra_deg"],
            "dec_deg": target["dec_deg"],
            "frame": "ICRS",
            "epoch": target["epoch"],
            "resolver": "test-targets",
            "warning": "",
            "pm_ra_mas_yr": target["pmra_mas_yr"],
            "pm_dec_mas_yr": target["pmdec_mas_yr"],
            "propagated_ra_deg": p_ra,
            "propagated_dec_deg": p_dec,
            "propagated_epoch": when.utc.isot,
        }

    def _simbad_query(self, query: str):
        from astroquery.simbad import Simbad  # type: ignore[import-untyped]

        Simbad.TIMEOUT = self.settings.simbad_timeout_seconds
        return Simbad.query_object(query)

    def _resolve_simbad(self, query: str) -> dict[str, Any]:
        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(self._simbad_query, query)
        try:
            table = future.result(timeout=self.settings.simbad_timeout_seconds)
        except FutureTimeout as exc:
            raise ResolutionError(
                f"SIMBAD did not answer in time for '{query}'. Enter RA/DEC manually."
            ) from exc
        except Exception as exc:  # noqa: BLE001
            log.warning("simbad query failed for %s: %s", query, exc)
            raise ResolutionError(
                f"SIMBAD did not resolve '{query}'. Enter RA/DEC manually."
            ) from exc
        finally:
            executor.shutdown(wait=False)
        if table is None or len(table) == 0:
            raise ResolutionError(f"'{query}' was not found in SIMBAD. Enter RA/DEC manually.")
        row = table[0]
        columns = {c.lower(): c for c in table.colnames}
        try:
            ra_deg = self._to_deg(row[columns["ra"]], is_ra=True)
            dec_deg = self._to_deg(row[columns["dec"]], is_ra=False)
        except (KeyError, ValueError, TypeError) as exc:
            raise ResolutionError(f"SIMBAD returned unparsable coordinates: {exc}") from exc
        validate_range(ra_deg, dec_deg)
        main_id = str(row[columns["main_id"]]) if "main_id" in columns else query
        return {
            "name": query,
            "catalog_id": main_id,
            "ra_deg": ra_deg,
            "dec_deg": dec_deg,
            "frame": "ICRS",
            "epoch": "J2000",
            "resolver": f"simbad@{datetime.now(timezone.utc).date().isoformat()}",
            "warning": "",
        }

    @staticmethod
    def _to_deg(value: Any, is_ra: bool) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            from astropy.coordinates import Angle  # type: ignore[import-untyped]

            return float(Angle(str(value), unit="hourangle" if is_ra else "deg").deg)


def match_known_target(ra_deg: float, dec_deg: float, tolerance_arcsec: float = 120.0):
    """A test target whose catalog or today's propagated position lies near (ra, dec).

    Returns (target, epoch) where epoch is the epoch of the matched position, or None.
    """
    import numpy as np

    today = _as_time(datetime.now(timezone.utc))
    best = None
    for target in load_test_targets():
        p_ra, p_dec = propagate(
            target["ra_deg"], target["dec_deg"], target["pmra_mas_yr"], target["pmdec_mas_yr"],
            target.get("parallax_mas"), target["epoch"], today,
        )
        for epoch, ra, dec in ((target["epoch"], target["ra_deg"], target["dec_deg"]),
                               (today.utc.isot, p_ra, p_dec)):
            sep = float(np.hypot((ra_deg - ra) * np.cos(np.deg2rad(dec)), dec_deg - dec) * 3600)
            if sep <= tolerance_arcsec and (best is None or sep < best[0]):
                best = (sep, target, epoch)
    return (best[1], best[2]) if best else None
