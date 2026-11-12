"""WP-08: idempotent, regenerable cutouts and a bounded, paced downloader."""

import pathlib

import pytest

httpx = pytest.importorskip("httpx")
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.database import SessionLocal, engine, init_db
from app.main import app
from app.models import Cutout, Observation
from app.routers import cutouts as cutouts_router
from app.services import store
from app.services.sia2_gateway import (
    ArchiveUnavailableError,
    DownloadTooLargeError,
    SPHERExDataGateway,
)

REAL = pathlib.Path(__file__).parent / "fixtures" / "real"
PAYLOAD = (REAL / "wise0855_d6_20250505.fits").read_bytes()
URL = "https://irsa.ipac.caltech.edu/ibe/data/spherex/x.fits"

client = TestClient(app)


class FakeDownloads:
    def __init__(self, payload=PAYLOAD, error=None):
        self.calls = []
        self.payload = payload
        self.error = error
        self.checked_out = []

    def __call__(self, url, dest_hint=""):
        self.calls.append(url)
        self.checked_out.append(engine.pool.checkedout())
        if self.error:
            raise self.error
        return self.payload, url


@pytest.fixture
def observation():
    init_db()
    with SessionLocal() as db:
        obs = Observation(
            obs_id="idem-1", product_id="idem-1/D6", collection="spherex_qr2", access_url=URL
        )
        db.add(obs)
        db.commit()
        return obs.id


@pytest.fixture
def downloads(monkeypatch):
    fake = FakeDownloads()
    monkeypatch.setattr(cutouts_router.gateway, "download", fake)
    return fake


def post(observation_id, **overrides):
    body = {"observation_id": observation_id, "ra_deg": 133.8189, "dec_deg": -7.2470,
            "size_arcmin": 6.0, **overrides}
    return client.post("/api/v1/cutouts", json=body)


def test_cutout_url_uses_the_irsa_center_and_size_syntax(observation, downloads):
    assert post(observation).status_code == 200
    assert downloads.calls == [f"{URL}?center=133.818900,-7.247000&size=0.100000"]


def test_two_identical_posts_download_once_and_return_the_same_id(observation, downloads):
    first = post(observation).json()
    second = post(observation).json()
    assert len(downloads.calls) == 1
    assert first["cutout_id"] == second["cutout_id"]
    assert second["fits_summary"]["quality"]["valid_fraction"] > 0.9


def test_a_different_position_or_size_is_a_different_cutout(observation, downloads):
    ids = {
        post(observation).json()["cutout_id"],
        post(observation, ra_deg=133.9).json()["cutout_id"],
        post(observation, size_arcmin=3.0).json()["cutout_id"],
    }
    assert len(ids) == 3
    assert len(downloads.calls) == 3


def test_a_new_processing_version_regenerates(observation, downloads, monkeypatch):
    first = post(observation).json()["cutout_id"]
    settings = get_settings()
    monkeypatch.setattr(settings, "processing_version", "2")
    second = post(observation).json()["cutout_id"]
    assert first != second
    assert len(downloads.calls) == 2


def test_deleted_blob_is_restored_by_the_next_post(observation, downloads):
    first = post(observation).json()
    pathlib.Path(store._local_path(first["storage_key"])).unlink()
    assert not store.storage_exists(first["storage_key"])
    second = post(observation).json()
    assert second["cutout_id"] == first["cutout_id"]
    assert len(downloads.calls) == 2
    assert store.storage_exists(second["storage_key"])


def test_database_connection_is_released_while_downloading(observation, downloads):
    post(observation)
    assert downloads.checked_out == [0]


def test_failed_cutout_is_reported_and_never_falls_back_to_the_full_file(observation, monkeypatch):
    fake = FakeDownloads(error=ArchiveUnavailableError("503 from IRSA"))
    monkeypatch.setattr(cutouts_router.gateway, "download", fake)
    response = post(observation)
    assert response.status_code == 502
    assert "503" in response.json()["detail"]
    assert len(fake.calls) == 1 and "center=" in fake.calls[0]


def test_oversized_download_is_413(observation, monkeypatch):
    fake = FakeDownloads(error=DownloadTooLargeError("too big"))
    monkeypatch.setattr(cutouts_router.gateway, "download", fake)
    assert post(observation).status_code == 413


def test_preview_is_cacheable_forever(observation, downloads):
    cutout = post(observation).json()
    response = client.get(cutout["preview_url"])
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_existing_duplicate_rows_are_left_alone(observation, downloads):
    with SessionLocal() as db:
        before = db.query(Cutout).count()
        db.add(Cutout(observation_id=observation, ra_deg=1.0, dec_deg=1.0, size_arcmin=6.0))
        db.add(Cutout(observation_id=observation, ra_deg=1.0, dec_deg=1.0, size_arcmin=6.0))
        db.commit()
        assert db.query(Cutout).count() == before + 2
    post(observation)
    with SessionLocal() as db:
        assert db.query(Cutout).count() == before + 3


class Exploding(httpx.SyncByteStream):
    def __iter__(self):
        raise AssertionError("body must not be read")
        yield b""


def gateway(handler, **settings):
    sleeps = []
    gw = SPHERExDataGateway(transport=httpx.MockTransport(handler), sleep=sleeps.append)
    if settings:
        gw.settings = gw.settings.model_copy(update=settings)
    return gw, sleeps


def test_declared_size_over_the_cap_is_rejected_without_reading_the_body():
    declared = str(65 * 1024 * 1024)
    gw, _ = gateway(
        lambda r: httpx.Response(200, headers={"content-length": declared}, stream=Exploding()),
        download_limit_mb=64,
    )
    with pytest.raises(DownloadTooLargeError):
        gw.download(URL)


def test_default_download_cap_is_64_mb():
    assert Settings(_env_file=None).download_limit_mb == 64


def test_503_is_retried_with_growing_waits_then_succeeds():
    answers = iter([httpx.Response(503), httpx.Response(503), httpx.Response(200, content=b"ok")])
    gw, sleeps = gateway(lambda r: next(answers), download_pause_seconds=0.0)
    data, _ = gw.download(URL)
    assert data == b"ok"
    waits = [s for s in sleeps if s > 0]
    assert len(waits) == 2 and waits[1] > waits[0]


def test_retries_are_capped():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(503)

    gw, _ = gateway(handler, download_max_attempts=3, download_pause_seconds=0.0)
    with pytest.raises(ArchiveUnavailableError):
        gw.download(URL)
    assert len(calls) == 3


def test_a_404_is_not_retried():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(404)

    gw, _ = gateway(handler, download_pause_seconds=0.0)
    with pytest.raises(ArchiveUnavailableError):
        gw.download(URL)
    assert len(calls) == 1
