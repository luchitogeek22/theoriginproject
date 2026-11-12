"""WP-28: WISE reference frame, mocked archive (no network)."""

import io
import pathlib
import sys

import httpx
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.services.reference_epoch import (  # noqa: E402
    LABEL, build_reference, cutout_url, pick_row, wanted_band,
)
from app.services.sequence import common_grid  # noqa: E402

RA0, DEC0 = 150.0, 2.0
CSV = (
    "in_row_id,in_ra,in_dec,band,coadd_id,mid_obs,dist_to_edge\n"
    "1,150,2,1,1500p015_ac51,2010-05-06 08:11:58,0.1\n"
    "1,150,2,2,1500p015_ac51,2010-05-06 08:11:58,0.1\n"
    "1,150,2,2,1501p015_ac51,2010-05-07 08:11:58,0.4\n"
)


def wise_fits(ra=RA0, dec=DEC0, offset_arcsec=(0.0, 0.0), size=120):
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crval = [ra, dec]
    wcs.wcs.crpix = [size / 2 + 0.5, size / 2 + 0.5]
    wcs.wcs.cdelt = [-1.375 / 3600, 1.375 / 3600]
    yy, xx = np.mgrid[:size, :size]
    sx, sy = wcs.all_world2pix([[ra + offset_arcsec[0] / 3600 / np.cos(np.deg2rad(dec)), dec + offset_arcsec[1] / 3600]], 0)[0]
    data = 50 * np.exp(-((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * 2.0**2)) + np.random.default_rng(1).normal(0, 0.5, (size, size))
    buffer = io.BytesIO()
    fits.HDUList([fits.PrimaryHDU(data.astype(np.float32), header=wcs.to_header())]).writeto(buffer)
    return buffer.getvalue()


def transport(requests):
    def handler(request):
        requests.append(str(request.url))
        return httpx.Response(200, text=CSV)

    return httpx.MockTransport(handler)


def test_band_follows_the_closest_wise_channel():
    assert wanted_band(4.96) == 2 and wanted_band(1.2) == 1 and wanted_band(None) == 2
    assert wanted_band(3.5) == 1


def test_the_row_farthest_from_the_edge_is_chosen_for_the_band():
    rows = list(__import__("csv").DictReader(io.StringIO(CSV)))
    assert pick_row(rows, 2)["coadd_id"] == "1501p015_ac51"
    assert pick_row(rows, 3) is None


def test_cutout_url_has_the_verified_ibe_shape():
    url = cutout_url({"coadd_id": "1342m076_ac51"}, 2, 133.8189, -7.247, 6.0)
    assert url.startswith("https://irsa.ipac.caltech.edu/ibe/data/wise/allwise/p3am_cdd/13/1342/1342m076_ac51/")
    assert url.endswith("1342m076_ac51-w2-int-3.fits?center=133.818900,-7.247000&size=0.10000deg")


def test_the_reference_frame_lands_on_the_sequence_grid_and_is_labelled():
    requests = []
    grid, n = common_grid(RA0, DEC0, 6.0)
    ref = build_reference(
        RA0, DEC0, 6.0, 4.96, grid, n,
        downloader=lambda url, hint: (wise_fits(offset_arcsec=(12.3, 0.0)), url),
        transport=transport(requests),
    )
    assert ref["label"] == LABEL and "other mission" in ref["label"]
    assert ref["band"] == "W2" and ref["coadd_id"] == "1501p015_ac51"
    image = np.asarray(Image.open(io.BytesIO(ref["png"])).convert("RGB"))[:, :, 0].astype(float)
    peak_y, peak_x = np.unravel_index(np.argmax(image), image.shape)
    expected_x = n / 2 - 0.5 - 12.3 / 6.15
    assert abs(peak_x - expected_x) <= 1.5
    assert abs((n - 1 - peak_y) - (n / 2 - 0.5)) <= 1.5
    assert len(requests) == 1


def test_gzipped_cutouts_from_the_archive_are_accepted():
    import gzip

    grid, n = common_grid(RA0, DEC0, 6.0)
    ref = build_reference(
        RA0, DEC0, 6.0, 4.96, grid, n,
        downloader=lambda url, hint: (gzip.compress(wise_fits()), url),
        transport=transport([]),
    )
    assert ref is not None and ref["png"][:8] == b"\x89PNG\r\n\x1a\n"


def test_a_failing_archive_gives_none_not_an_error():
    def boom(request):
        raise httpx.ConnectError("down")

    grid, n = common_grid(RA0, DEC0, 6.0)
    assert build_reference(
        RA0, DEC0, 6.0, 4.0, grid, n, downloader=lambda *a: (b"", ""), transport=httpx.MockTransport(boom)
    ) is None
