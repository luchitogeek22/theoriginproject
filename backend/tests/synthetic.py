"""Synthetic SPHEREx-like FITS generator (TEST ONLY, never shown to users).

The spectral WCS (WCS-WAVE table and alternate key "W") is borrowed from a real cutout so the
products read like the archive's; image, flags, variance, zodi and the celestial WCS are made up.
"""

import io
import pathlib

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

TEMPLATE = pathlib.Path(__file__).parent / "fixtures" / "real" / "wise0855_d6_20250505.fits"
SIP_KEYS = ("A_", "B_", "AP_", "BP_")
DETECTOR_CENTRE_UM = {1: 0.9, 2: 1.3, 3: 1.7, 4: 2.6, 5: 3.8, 6: 4.96}


def _celestial_wcs(shape, center, rotation_deg, scale_arcsec, crpix=None):
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crval = list(center)
    wcs.wcs.crpix = list(crpix) if crpix else [shape[1] / 2 + 0.5, shape[0] / 2 + 0.5]
    theta = np.deg2rad(rotation_deg)
    scale = scale_arcsec / 3600.0
    wcs.wcs.cd = scale * np.array(
        [[-np.cos(theta), np.sin(theta)], [np.sin(theta), np.cos(theta)]]
    )
    return wcs


def make_fits(
    sources=(),
    shape=(64, 64),
    center=(150.0, 2.0),
    rotation_deg=0.0,
    scale_arcsec=6.15,
    noise=0.2,
    seed=0,
    detector=6,
    mjd=60800.0,
    background=1.0,
    fwhm_pix=2.0,
    zodi=0.0,
    flags=None,
    crpix=None,
    halo_fraction=0.0,
    epsf_zones=None,
    epsf_oversample=5,
    parent_crpix=(-300.0, -100.0),
):
    """sources: iterable of (ra_deg, dec_deg, peak). Returns FITS bytes."""
    rng = np.random.default_rng(seed)
    wcs = _celestial_wcs(shape, center, rotation_deg, scale_arcsec, crpix)
    yy, xx = np.mgrid[: shape[0], : shape[1]]
    sigma = fwhm_pix / 2.355
    image = np.full(shape, background + zodi, dtype=float)
    for ra, dec, peak in sources:
        x, y = wcs.all_world2pix([[ra, dec]], 0)[0]
        r2 = (xx - x) ** 2 + (yy - y) ** 2
        image += peak * np.exp(-r2 / (2 * sigma**2))
        if halo_fraction:
            image += peak * halo_fraction * (1.0 + r2 / 9.0) ** -1.5
    image += rng.normal(0.0, noise, shape)

    with fits.open(TEMPLATE, memmap=False) as template:
        header = template["IMAGE"].header.copy()
        wave_table = template["WCS-WAVE"].copy()
    for key in list(header):
        if any(key.startswith(prefix) for prefix in SIP_KEYS) or key in ("PC1_1", "PC1_2", "PC2_1", "PC2_2"):
            del header[key]
    for key in ("NAXIS1", "NAXIS2"):
        header[key] = shape[1] if key == "NAXIS1" else shape[0]
    header.update(wcs.to_header())
    header["CTYPE1"], header["CTYPE2"] = "RA---TAN", "DEC--TAN"
    header["PSF_FWHM"] = fwhm_pix * scale_arcsec
    header["MJD-OBS"] = mjd
    header["DATE-OBS"] = f"mjd-{mjd}"
    if detector in DETECTOR_CENTRE_UM:
        wave_table.data["VALUES"][...] *= DETECTOR_CENTRE_UM[detector] / DETECTOR_CENTRE_UM[6]
    if detector is None:
        del header["DETECTOR"]
    else:
        header["DETECTOR"] = detector

    flag_plane = np.zeros(shape, dtype=np.int32) if flags is None else np.asarray(flags, dtype=np.int32)
    hdus = [
        fits.PrimaryHDU(),
        fits.ImageHDU(image.astype(np.float32), header=header, name="IMAGE"),
        fits.ImageHDU(flag_plane, name="FLAGS"),
        fits.ImageHDU(np.full(shape, noise**2, dtype=np.float32), name="VARIANCE"),
        fits.ImageHDU(np.full(shape, zodi, dtype=np.float32), name="ZODI"),
        wave_table,
    ]
    if epsf_zones is not None:
        # DR1 (v7+) layout: one row per detector zone, centres in 0-based parent-image pixels.
        header["CRPIX1A"], header["CRPIX2A"] = parent_crpix
        hdus[1].header["CRPIX1A"], hdus[1].header["CRPIX2A"] = parent_crpix
        stamps = np.array([z[4] for z in epsf_zones], dtype=np.float32)
        size = stamps.shape[1]
        table = fits.BinTableHDU.from_columns(
            [
                fits.Column(name="BINX", format="J", array=[z[2] for z in epsf_zones]),
                fits.Column(name="BINY", format="J", array=[z[3] for z in epsf_zones]),
                fits.Column(name="XCENTER", format="E", array=[z[0] for z in epsf_zones]),
                fits.Column(name="YCENTER", format="E", array=[z[1] for z in epsf_zones]),
                fits.Column(name="EPSF", format=f"{size * size}E", dim=f"({size},{size})", array=stamps),
            ],
            name="EPSF",
        )
        table.header["OVSMPX"] = epsf_oversample
        table.header["OVSMPY"] = epsf_oversample
        hdus.insert(5, table)
    buffer = io.BytesIO()
    fits.HDUList(hdus).writeto(buffer)
    return buffer.getvalue()
