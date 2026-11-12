"""WP-10: sequence engine on synthetic SPHEREx-like frames."""

import io
import sys
import pathlib

import numpy as np
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import synthetic  # noqa: E402
from PIL import Image  # noqa: E402

from app.services.sequence import FrameInput, render_sequence, select_items  # noqa: E402

RA0, DEC0 = 150.0, 2.0
SCALE = 6.15 / 3600.0


def meta(n=0, detector=6, mjd=60800.0):
    return {
        "obs_id": f"obs{n}", "collection": "spherex_qr2", "detector": detector,
        "t_min_mjd": mjd, "t_max_mjd": mjd + 0.001,
    }


def frame(sources, n=0, mjd=60800.0, detector=6, **kw):
    data = synthetic.make_fits(sources=sources, mjd=mjd, detector=detector, seed=n, **kw)
    return FrameInput(meta=meta(n, detector, mjd), data=data)


def gray(png):
    return np.asarray(Image.open(io.BytesIO(png)).convert("RGB"))[:, :, 0].astype(float)


def centroid(png, radius=None):
    rgb = np.asarray(Image.open(io.BytesIO(png)).convert("RGB")).astype(float)
    covered = rgb[:, :, 0] == rgb[:, :, 2]
    img = rgb[:, :, 0]
    yy, xx = np.mgrid[: img.shape[0], : img.shape[1]]
    peak = np.where(covered, img, 0).max()
    w = np.where(covered & (img > 0.8 * peak), img, 0.0)
    return (w * xx).sum() / w.sum(), (w * yy).sum() / w.sum()


def test_brightness_scale_is_shared_so_a_tripled_star_is_three_times_brighter():
    frames = [
        frame([(RA0, DEC0, 5.0)], n=1, mjd=60800.0),
        frame([(RA0, DEC0, 15.0)], n=2, mjd=60801.0),
    ]
    out = render_sequence(frames, RA0, DEC0, 6.0, "brightness", hi_percentile=100)
    one, three = (gray(p) for p in out.pngs)
    assert three.max() > one.max()
    usable = (three < 250) & (three - np.median(three) > 8)
    ratio = (three - np.median(three))[usable].sum() / (one - np.median(one))[usable].sum()
    assert ratio == pytest.approx(3.0, rel=0.15)
    assert out.result["scale"]["mode"] == "brightness"
    assert out.result["scale"]["unit"] == "MJy/sr"


def test_the_same_sky_source_lands_on_the_same_pixel_with_different_wcs():
    source = (RA0 + 0.02, DEC0 + 0.015, 20.0)
    a = frame([source], n=1, mjd=60800.0, center=(RA0, DEC0), rotation_deg=0.0)
    b = frame(
        [source], n=2, mjd=60810.0, center=(RA0 + 0.01, DEC0 - 0.008), rotation_deg=31.0,
    )
    out = render_sequence([a, b], RA0, DEC0, 10.0, "brightness")
    (xa, ya), (xb, yb) = (centroid(p) for p in out.pngs)
    assert abs(xa - xb) <= 1.0 and abs(ya - yb) <= 1.0


def test_a_two_pixel_shift_between_frames_is_recovered():
    scale = SCALE
    s1 = (RA0 + 4 * scale, DEC0, 25.0)
    s2 = (RA0 + 2 * scale, DEC0, 25.0)
    frames = [frame([s1], n=1, mjd=60800.0), frame([s2], n=2, mjd=60801.0)]
    out = render_sequence(frames, RA0, DEC0, 6.0, "motion")
    (x1, _), (x2, _) = (centroid(p) for p in out.pngs)
    assert abs((x1 - x2)) == pytest.approx(2.0, abs=0.5)


def test_north_is_up_and_east_is_left():
    north = (RA0, DEC0 + 10 * SCALE, 25.0)
    east = (RA0 + 10 * SCALE / np.cos(np.deg2rad(DEC0)), DEC0, 25.0)
    out = render_sequence(
        [frame([north], n=1), frame([east], n=2, mjd=60801.0)], RA0, DEC0, 6.0, "motion"
    )
    n_img, e_img = out.pngs
    centre = gray(n_img).shape[0] / 2
    x_n, y_n = centroid(n_img)
    x_e, y_e = centroid(e_img)
    assert y_n < centre - 5
    assert x_e < gray(e_img).shape[1] / 2 - 5


def test_frames_come_out_in_date_order_whatever_the_input_order():
    frames = [
        frame([(RA0, DEC0, 9.0)], n=3, mjd=60830.0),
        frame([(RA0, DEC0, 9.0)], n=1, mjd=60810.0),
        frame([(RA0, DEC0, 9.0)], n=2, mjd=60820.0),
    ]
    out = render_sequence(frames, RA0, DEC0, 6.0, "motion")
    assert [f["obs_id"] for f in out.result["frames"]] == ["obs1", "obs2", "obs3"]
    assert [f["index"] for f in out.result["frames"]] == [0, 1, 2]


def test_a_different_or_missing_detector_is_excluded_and_reported():
    frames = [
        frame([(RA0, DEC0, 9.0)], n=1, mjd=60800.0, detector=6),
        frame([(RA0, DEC0, 9.0)], n=2, mjd=60801.0, detector=6),
        frame([(RA0, DEC0, 9.0)], n=3, mjd=60802.0, detector=2),
        frame([(RA0, DEC0, 9.0)], n=4, mjd=60803.0, detector=None),
    ]
    frames[3].meta["detector"] = None
    out = render_sequence(frames, RA0, DEC0, 6.0, "motion")
    assert out.result["n_used"] == 2
    assert out.result["n_available"] == 4
    text = " ".join(out.result["limitations"]).lower()
    assert "detector" in text


def test_one_frame_completes_with_an_explicit_limitation():
    out = render_sequence([frame([(RA0, DEC0, 9.0)])], RA0, DEC0, 6.0, "motion")
    assert out.result["n_used"] == 1
    assert any("one" in lim.lower() for lim in out.result["limitations"])


def test_zero_frames_completes_with_a_limitation():
    out = render_sequence([], RA0, DEC0, 6.0, "motion")
    assert out.result["n_used"] == 0 and out.result["frames"] == []
    assert out.result["limitations"]


def test_uncovered_pixels_use_a_neutral_colour_that_is_not_the_background():
    near = frame([(RA0, DEC0, 9.0)], n=1, mjd=60800.0)
    far = frame([], n=2, mjd=60801.0, center=(RA0 + 0.2, DEC0))
    out = render_sequence([near, far], RA0, DEC0, 6.0, "motion")
    rgb = np.asarray(Image.open(io.BytesIO(out.pngs[1])).convert("RGB"))
    assert out.result["frames"][1]["coverage_fraction"] < 0.05
    colours = {tuple(c) for c in rgb.reshape(-1, 3)}
    assert any(r != g or g != b for r, g, b in colours)
    assert (0, 0, 0) not in colours


def test_wavelength_is_reported_per_frame():
    out = render_sequence(
        [frame([(RA0, DEC0, 9.0)], n=1), frame([(RA0, DEC0, 9.0)], n=2, mjd=60801.0)],
        RA0, DEC0, 6.0, "motion",
    )
    assert all(4.0 < f["wavelength_um"] < 5.5 for f in out.result["frames"])


def item(n, detector, mjd, collection="spherex_qr2"):
    return {
        "obs_id": f"o{n}", "product_id": f"{collection}/{n}/D{detector}", "collection": collection,
        "detector": detector, "t_min_mjd": mjd,
    }


def test_selection_prefers_the_detector_with_most_epochs():
    items = [item(1, 1, 60800), item(2, 6, 60801), item(3, 6, 60802), item(4, 6, 60803),
             item(5, 3, 60804), item(6, None, 60805)]
    chosen, available, limitations = select_items(items, None, 12)
    assert {c["detector"] for c in chosen} == {6}
    assert available == 6
    assert [c["obs_id"] for c in chosen] == ["o2", "o3", "o4"]
    assert any("detector" in lim.lower() for lim in limitations)


def test_selection_honours_a_requested_detector_and_the_frame_cap():
    items = [item(n, 6, 60800 + n) for n in range(30)] + [item(99, 2, 60900)]
    chosen, _, limitations = select_items(items, 6, 12)
    assert len(chosen) == 12
    assert chosen[0]["t_min_mjd"] < chosen[-1]["t_min_mjd"]
    assert chosen[0]["obs_id"] == "o0" and chosen[-1]["obs_id"] == "o29"
    assert any("12" in lim for lim in limitations)
    none, _, lim2 = select_items(items, 5, 12)
    assert none == [] and lim2


# --- job level -------------------------------------------------------------------------------

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.routers import sequences as sequences_router  # noqa: E402
from app.services import cutout_store  # noqa: E402

client = TestClient(app)
URL = "https://irsa.ipac.caltech.edu/ibe/data/spherex/"


def fake_items(n=3, detector=6):
    return [
        {
            "obs_id": f"o{k}", "product_id": f"spherex_qr2/o{k}/D{detector}", "collection": "spherex_qr2",
            "detector": detector, "t_min_mjd": 60800.0 + 60 * k, "t_max_mjd": 60800.001 + 60 * k,
            "ra_deg": RA0, "dec_deg": DEC0, "access_url": f"{URL}o{k}_D{detector}.fits",
            "date_obs": "", "instrument": "", "band": "", "dataproduct_type": "",
            "access_format": "", "filesize_bytes": None, "s_region": "",
        }
        for k in range(n)
    ]


@pytest.fixture
def archive(monkeypatch):
    state = {"items": fake_items(3), "downloads": []}
    monkeypatch.setattr(
        sequences_router.gateway, "search",
        lambda *a, **k: {"items": state["items"], "warnings": [], "count": len(state["items"])},
    )

    def download(url, dest_hint=""):
        state["downloads"].append(url)
        k = int(url.split("/o")[1].split("_")[0])
        return synthetic.make_fits(sources=[(RA0, DEC0, 9.0)], seed=k, mjd=60800.0 + 60 * k), url

    monkeypatch.setattr(cutout_store.gateway, "download", download)
    return state


def post_sequence(**overrides):
    body = {"ra_deg": RA0, "dec_deg": DEC0, "size_arcmin": 6.0, "mode": "motion", **overrides}
    job = client.post("/api/v1/sequences", json=body).json()
    return client.get(f"/api/v1/jobs/{job['job_id']}/results").json()


def test_a_sequence_job_completes_with_png_frames(archive):
    done = post_sequence()
    assert done["status"] == "completed"
    result = done["result"]
    assert result["n_used"] == 3 and result["n_available"] >= 3
    first = result["frames"][0]["png_url"]
    response = client.get(first)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert "immutable" in response.headers["cache-control"]


def test_identical_requests_reuse_the_stored_result(archive):
    first = post_sequence()
    downloads = len(archive["downloads"])
    second = post_sequence()
    assert len(archive["downloads"]) == downloads
    assert second["result"]["key"] == first["result"]["key"]


def test_one_available_frame_still_completes(archive):
    archive["items"] = fake_items(1)
    done = post_sequence(ra_deg=RA0 + 0.001)
    assert done["status"] == "completed" and done["result"]["n_used"] == 1


def test_archive_down_fails_with_a_friendly_message(monkeypatch):
    def down(*a, **k):
        raise sequences_router.ArchiveUnavailableError("503 secret-host")

    monkeypatch.setattr(sequences_router.gateway, "search", down)
    done = post_sequence(ra_deg=RA0 + 0.002)
    assert done["status"] == "failed"
    assert "secret-host" not in done["error"]


def test_invalid_request_is_rejected():
    for body in (
        {"ra_deg": 999, "dec_deg": 0},
        {"ra_deg": 1, "dec_deg": 0, "size_arcmin": 0.5},
        {"ra_deg": 1, "dec_deg": 0, "max_frames": 99},
        {"ra_deg": 1, "dec_deg": 0, "mode": "other"},
    ):
        assert client.post("/api/v1/sequences", json=body).status_code == 422


def test_frame_endpoint_rejects_odd_keys():
    assert client.get("/api/v1/sequences/../frames/0.png").status_code in (404, 422)
    assert client.get("/api/v1/sequences/NOTAKEY/frames/0.png").status_code == 404


def test_sequence_job_carries_lightcurve_overlay_and_degrades_without_gaia(archive, monkeypatch):
    from app.services.catalogs import CatalogUnavailable
    from app.services import sequence_extras

    def down(*a, **k):
        raise CatalogUnavailable("down")

    monkeypatch.setattr(sequence_extras, "gaia_cone", down)
    monkeypatch.setattr(sequences_router, "build_lightcurve",
                        lambda kept, params: sequence_extras.build_lightcurve(kept, params, gaia_fn=down))
    monkeypatch.setattr(sequences_router, "build_overlay",
                        lambda kept, grid, n, params: sequence_extras.build_overlay(kept, grid, n, params, gaia_fn=down))
    done = post_sequence(ra_deg=RA0 + 0.003)
    assert done["status"] == "completed"
    result = done["result"]
    assert result["lightcurve"]["relative"] is False
    assert "absolute" in result["lightcurve"]["label"]
    assert result["overlay"]["gaia_available"] is False
    assert len(result["lightcurve"]["points"]) == result["n_used"]


def test_shift_stack_job_needs_three_visits_and_says_so(archive):
    archive["items"] = fake_items(2)
    job = client.post("/api/v1/sequences/shift-stack", json={"ra_deg": RA0 + 0.004, "dec_deg": DEC0}).json()
    done = client.get(f"/api/v1/jobs/{job['job_id']}/results").json()
    assert done["status"] == "completed"
    assert done["result"]["ok"] is False
    assert any("visits" in lim for lim in done["result"]["limitations"])


def test_shift_stack_job_runs_end_to_end_on_three_visits(archive):
    archive["items"] = fake_items(4)
    job = client.post(
        "/api/v1/sequences/shift-stack",
        json={"ra_deg": RA0 + 0.005, "dec_deg": DEC0, "size_arcmin": 3, "steps": 3, "max_speed_arcsec_yr": 20},
    ).json()
    done = client.get(f"/api/v1/jobs/{job['job_id']}/results").json()
    assert done["status"] == "completed"
    result = done["result"]
    assert result["ok"] is True and result["n_visits"] == 4
    assert client.get(result["stack_png_url"]).status_code == 200


def test_a_fast_known_target_is_centred_on_its_position_at_the_mean_epoch(archive):
    from astropy.time import Time

    from app.services.targets import propagate

    catalog = (133.81890825, -7.247048)
    done = post_sequence(ra_deg=catalog[0], dec_deg=catalog[1])
    assert done["status"] == "completed"
    grid = done["result"]["grid"]
    mean_mjd = np.mean([i["t_min_mjd"] for i in archive["items"]])
    expected = propagate(*catalog, -8123.7, 673.2, 439.0, "J2000", Time(mean_mjd, format="mjd"))
    moved_arcsec = np.hypot(
        (grid["ra_deg"] - catalog[0]) * np.cos(np.deg2rad(catalog[1])), grid["dec_deg"] - catalog[1]
    ) * 3600
    assert moved_arcsec > 100
    assert abs(grid["ra_deg"] - expected[0]) * 3600 < 0.5
    assert all("center=133.7" in url for url in archive["downloads"])


def test_motion_parameters_and_reference_change_the_cache_key(archive):
    base = post_sequence(ra_deg=RA0 + 0.006)["result"]["key"]
    with_motion = post_sequence(ra_deg=RA0 + 0.006, pm_ra_mas_yr=3000.0, pm_dec_mas_yr=3000.0)["result"]["key"]
    assert with_motion != base


def test_a_degraded_result_is_not_frozen_in_the_cache(archive, monkeypatch):
    original = cutout_store.gateway.download
    state = {"fail": True}

    def flaky(url, dest_hint=""):
        if state["fail"] and "/o2_D6.fits" in url:
            raise sequences_router.ArchiveUnavailableError("503")
        return original(url, dest_hint)

    monkeypatch.setattr(cutout_store.gateway, "download", flaky)
    first = post_sequence(ra_deg=RA0 + 0.007)
    assert first["result"]["n_used"] == 2
    state["fail"] = False
    second = post_sequence(ra_deg=RA0 + 0.007)
    assert second["result"]["n_used"] == 3


def test_when_irsa_goes_down_the_last_real_result_is_served_and_labelled(archive, monkeypatch):
    first = post_sequence(ra_deg=RA0 + 0.008)
    assert first["status"] == "completed" and "served_from_cache" not in first["result"]

    def down(*a, **k):
        raise sequences_router.ArchiveUnavailableError("503")

    monkeypatch.setattr(sequences_router.gateway, "search", down)
    again = post_sequence(ra_deg=RA0 + 0.008)
    assert again["status"] == "completed"
    result = again["result"]
    assert result["served_from_cache"] is True
    assert result["key"] == first["result"]["key"] and result["n_used"] == first["result"]["n_used"]
    assert "served from cache" in result["cache_label"]
    assert result["queried_at"] == first["result"]["queried_at"]


def test_with_irsa_down_and_nothing_cached_the_job_fails_politely(archive, monkeypatch):
    def down(*a, **k):
        raise sequences_router.ArchiveUnavailableError("503")

    monkeypatch.setattr(sequences_router.gateway, "search", down)
    done = post_sequence(ra_deg=RA0 + 0.0091, dec_deg=DEC0 + 0.5)
    assert done["status"] == "failed" and "archive did not answer" in done["error"]


def test_motion_mode_prefers_the_long_wavelength_detector(archive):
    archive["items"] = fake_items(4, detector=1) + [
        {**item, "obs_id": f"p{n}", "product_id": f"spherex_qr2/p{n}/D6", "detector": 6,
         "t_min_mjd": 60900.0 + 60 * n, "access_url": f"{URL}o{n + 10}_D6.fits"}
        for n, item in enumerate(fake_items(2, detector=6))
    ]
    motion = post_sequence(ra_deg=RA0 + 0.011, mode="motion")["result"]
    assert motion["n_used"] == 2
    assert any("detector D6" in lim for lim in motion["limitations"])
    brightness = post_sequence(ra_deg=RA0 + 0.011, mode="brightness")["result"]
    assert brightness["n_used"] == 4
    explicit = post_sequence(ra_deg=RA0 + 0.011, mode="motion", detector=1)["result"]
    assert explicit["n_used"] == 4


def test_the_lightcurve_says_when_the_target_is_not_detected_in_each_frame(archive):
    done = post_sequence(ra_deg=RA0 + 0.5, dec_deg=DEC0 + 0.5)
    curve = done["result"]["lightcurve"]
    assert curve["target_detected"] is False
    assert any("could not be measured" in note or "not detected individually" in note for note in curve["limitations"])
