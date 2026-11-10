"""Target resolution via SIMBAD (astroquery). Manual coordinates always allowed.

WISE 0855 coordinates are pinned from the project brief:
RA = 133.795129 deg, DEC = -7.245147 deg.
"""

from datetime import datetime, timezone

from app.config import get_settings
from app.logging import get_logger

log = get_logger("targets")

# Coordinates supplied directly by the project specification.
PINNED_TARGETS = {
    "wise 0855": {
        "name": "WISE 0855",
        "catalog_id": "WISE J085510.83-071442.5",
        "ra_deg": 133.795129,
        "dec_deg": -7.245147,
    },
}


class ResolutionError(RuntimeError):
    pass


class TargetResolutionService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def resolve(
        self,
        name: str | None = None,
        ra_deg: float | None = None,
        dec_deg: float | None = None,
        catalog_id: str | None = None,
    ) -> dict:
        if ra_deg is not None and dec_deg is not None:
            return {
                "name": name or catalog_id or f"Manual ({ra_deg:.5f}, {dec_deg:.5f})",
                "catalog_id": catalog_id or "",
                "ra_deg": float(ra_deg),
                "dec_deg": float(dec_deg),
                "frame": "ICRS",
                "epoch": "J2000",
                "resolver": "manual",
                "warning": "",
            }
        query = (name or catalog_id or "").strip()
        if not query:
            raise ResolutionError("Provide a name, catalog id, or RA/DEC coordinates.")
        pinned = PINNED_TARGETS.get(query.lower())
        if pinned:
            return {
                "name": pinned["name"],
                "catalog_id": pinned["catalog_id"],
                "ra_deg": pinned["ra_deg"],
                "dec_deg": pinned["dec_deg"],
                "frame": "ICRS",
                "epoch": "J2000",
                "resolver": "project-specification",
                "warning": "",
            }
        return self._resolve_simbad(query)

    def _resolve_simbad(self, query: str) -> dict:
        try:
            from astroquery.simbad import Simbad  # type: ignore[import-untyped]
        except ImportError as exc:
            raise ResolutionError(f"SIMBAD client unavailable: {exc}") from exc
        try:
            Simbad.TIMEOUT = self.settings.simbad_timeout_seconds
            table = Simbad.query_object(query)
        except Exception as exc:  # noqa: BLE001
            log.warning("simbad query failed for %s: %s", query, exc)
            raise ResolutionError(
                f"SIMBAD did not resolve '{query}'. Enter RA/DEC manually."
            ) from exc
        if table is None or len(table) == 0:
            raise ResolutionError(
                f"'{query}' was not found in SIMBAD. Enter RA/DEC manually."
            )
        row = table[0]
        try:
            ra = float(str(row["ra"]).strip().split()[0]) if "ra" in table.colnames else None
            dec = float(str(row["dec"]).strip().split()[0]) if "dec" in table.colnames else None
            if ra is None and "RA" in table.colnames:
                ra = float(row["RA"])
            if dec is None and "DEC" in table.colnames:
                dec = float(row["DEC"])
        except (ValueError, TypeError) as exc:
            raise ResolutionError(f"SIMBAD returned unparsable coordinates: {exc}") from exc
        # astroquery may return sexagesimal strings; convert when needed.
        ra_deg = self._to_deg(ra, row, table, is_ra=True)
        dec_deg = self._to_deg(dec, row, table, is_ra=False)
        main_id = str(row["main_id"]) if "main_id" in table.colnames else query
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
    def _to_deg(value: float | None, row, table, is_ra: bool) -> float:
        if value is not None:
            return float(value)
        from astropy.coordinates import Angle  # type: ignore[import-untyped]

        col = "ra" if "ra" in table.colnames else "RA"
        if not is_ra:
            col = "dec" if "dec" in table.colnames else "DEC"
        angle = Angle(str(row[col]), unit="hourangle" if is_ra else "deg")
        return float(angle.deg)
