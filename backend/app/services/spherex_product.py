"""Reader for SPHEREx Level 2 spectral image products and their IRSA cutouts.

Extensions are located by EXTNAME, never by index. Celestial WCS is built from the
IMAGE header with the HDU list (SIP) and the spectral WCS uses alternate key "W"
(WCS-WAVE lookup table). ZODI is not subtracted from IMAGE by the archive.
"""

import io
from dataclasses import dataclass, field
from typing import Any

import numpy as np

HARD_MASK_BITS = (0, 2, 6, 7, 9, 10, 11, 15, 17, 26, 27, 28, 29)
HARD_MASK = sum(1 << bit for bit in HARD_MASK_BITS)
SOURCE_BIT = 21


def hard_mask_valid(flags: np.ndarray) -> np.ndarray:
    """True where no unusable-pixel bit is set. SOURCE (bit 21) is nominal and never masks."""
    return (np.asarray(flags).astype(np.int64) & HARD_MASK) == 0


@dataclass
class SpherexProduct:
    image: np.ndarray
    header: Any
    wcs: Any
    flags: np.ndarray | None = None
    variance: np.ndarray | None = None
    zodi: np.ndarray | None = None
    wave_hdu: Any = field(default=None, repr=False)
    epsf: dict[str, Any] | None = field(default=None, repr=False)
    extension_names: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    _wave_wcs: Any = field(default=None, repr=False)

    @property
    def wave_wcs(self):
        if self._wave_wcs is None and self.wave_hdu is not None:
            from astropy.io import fits  # type: ignore[import-untyped]
            from astropy.wcs import WCS  # type: ignore[import-untyped]

            holder = fits.HDUList(
                [fits.PrimaryHDU(), fits.ImageHDU(header=self.header, name="IMAGE"), self.wave_hdu]
            )
            self._wave_wcs = _build_wcs(WCS, self.header, holder, "W", self.warnings, "spectral WCS")
            self.wave_hdu = None if self._wave_wcs is not None else self.wave_hdu
        return self._wave_wcs

    @property
    def detector(self) -> int | None:
        value = self.header.get("DETECTOR")
        return int(value) if value is not None else None

    @property
    def mjd_obs(self) -> float | None:
        value = self.header.get("MJD-OBS")
        return float(value) if value is not None else None

    @property
    def date_obs(self) -> str:
        return str(self.header.get("DATE-OBS", ""))

    @property
    def obs_id(self) -> str:
        return str(self.header.get("OBSID", ""))

    @property
    def bunit(self) -> str:
        return str(self.header.get("BUNIT", ""))

    @property
    def science_image(self) -> np.ndarray:
        return self.image - self.zodi if self.zodi is not None else self.image

    @property
    def quality_mask(self) -> np.ndarray:
        valid = np.isfinite(self.image)
        if self.flags is not None:
            valid &= hard_mask_valid(self.flags)
        if self.variance is not None:
            valid &= np.isfinite(self.variance) & (self.variance > 0)
        return valid

    def pixel_of(self, ra_deg: float, dec_deg: float) -> tuple[float, float]:
        if self.wcs is None:
            raise ValueError("Product has no celestial WCS.")
        x, y = self.wcs.all_world2pix([[ra_deg, dec_deg]], 0)[0]
        return float(x), float(y)

    def wavelengths_at(self, pixels: np.ndarray) -> np.ndarray:
        """Rows of (wavelength, bandwidth) in micron for an (N, 2) array of 0-based (x, y)."""
        if self.wave_wcs is None:
            raise ValueError("Product has no spectral WCS (WCS-WAVE).")
        return np.asarray(self.wave_wcs.all_pix2world(np.asarray(pixels, dtype=float), 0))[:, :2]

    def wavelength_at(self, x: float, y: float) -> tuple[float, float]:
        wave, bandwidth = self.wavelengths_at(np.array([[x, y]]))[0]
        return float(wave), float(bandwidth)


def _plane(hdul, name: str, shape: tuple[int, ...], warnings: list[str]) -> np.ndarray | None:
    if name not in hdul or hdul[name].data is None:
        return None
    data = np.asarray(hdul[name].data)
    if data.shape != shape:
        warnings.append(f"{name} shape {data.shape} differs from IMAGE {shape}; ignored.")
        return None
    return data


def _read_epsf(hdul, warnings: list[str]) -> dict[str, Any] | None:
    """Zone table of the empirical PSF (pipeline v7+, e.g. DR1). Older products carry a `PSF` cube instead.

    Zone centres are 0-based pixels of the parent spectral image; stamps are oversampled by OVSMPX.
    """
    if "EPSF" not in hdul or hdul["EPSF"].data is None:
        return None
    try:
        table = hdul["EPSF"].data
        oversample = int(hdul["EPSF"].header.get("OVSMPX") or 0)
        if oversample <= 0:
            raise ValueError("OVSMPX missing")
        return {
            "binx": np.asarray(table["BINX"], dtype=int),
            "biny": np.asarray(table["BINY"], dtype=int),
            "xcenter": np.asarray(table["XCENTER"], dtype=np.float64),
            "ycenter": np.asarray(table["YCENTER"], dtype=np.float64),
            "stamps": np.asarray(table["EPSF"], dtype=np.float64),
            "oversample": oversample,
        }
    except Exception as exc:  # noqa: BLE001 - recorded, photometry falls back to no correction
        warnings.append(f"EPSF unreadable: {exc}")
        return None


def read_product(data: bytes) -> SpherexProduct:
    from astropy.io import fits  # type: ignore[import-untyped]
    from astropy.wcs import WCS  # type: ignore[import-untyped]

    try:
        hdul = fits.open(io.BytesIO(data), memmap=False)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Not a readable FITS file: {exc}") from exc
    with hdul:
        names = [str(h.name) for h in hdul]
        if "IMAGE" not in hdul or hdul["IMAGE"].data is None:
            raise ValueError("IMAGE extension missing or empty.")
        header = hdul["IMAGE"].header.copy()
        image = np.asarray(hdul["IMAGE"].data, dtype=np.float64)
        warnings: list[str] = []
        flags = _plane(hdul, "FLAGS", image.shape, warnings)
        variance = _plane(hdul, "VARIANCE", image.shape, warnings)
        zodi = _plane(hdul, "ZODI", image.shape, warnings)
        if variance is not None:
            variance = variance.astype(np.float64)
        if zodi is not None:
            zodi = zodi.astype(np.float64)
        wcs = _build_wcs(WCS, header, hdul, None, warnings, "celestial WCS")
        wave_hdu = hdul["WCS-WAVE"].copy() if "WCS-WAVE" in hdul else None
        epsf = _read_epsf(hdul, warnings)
    celestial = wcs.celestial if wcs is not None and wcs.has_celestial else None
    if celestial is None:
        warnings.append("IMAGE header carries no celestial WCS.")
    return SpherexProduct(
        image=image,
        header=header,
        wcs=celestial,
        flags=flags,
        variance=variance,
        zodi=zodi,
        wave_hdu=wave_hdu,
        epsf=epsf,
        extension_names=names,
        warnings=warnings,
    )


def _build_wcs(wcs_class, header, hdul, key, warnings: list[str], label: str):
    try:
        return wcs_class(header, hdul, key=key) if key else wcs_class(header, hdul)
    except Exception as exc:  # noqa: BLE001 - recorded, caller degrades honestly
        warnings.append(f"{label} unreadable: {exc}")
        return None
