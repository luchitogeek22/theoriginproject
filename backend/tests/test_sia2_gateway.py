"""WP-07: SIA2 gateway behaviour against a mocked archive (no network)."""

import pytest

httpx = pytest.importorskip("httpx")

from app.config import get_settings
from app.services import store
from app.services.sia2_gateway import (
    ArchiveUnavailableError,
    InvalidCollectionError,
    SPHERExDataGateway,
)

HEADER = (
    "s_ra,s_dec,energy_bandpassname,obs_id,em_min,em_max,access_url,obs_collection,"
    "t_min,t_max,obs_publisher_did,s_fov,cloud_access,o_ucd,upload_row_id"
)


def csv_row(did="ivo://irsa.ipac/spherex_qr2?2025W44_2B_0322_4/D3", det="SPHEREx-D3",
            obs="2025W44_2B_0322_4", t_min=60800.5):
    return (
        f"133.8,-7.2,{det},{obs},1.0e-6,1.3e-6,https://irsa.ipac.caltech.edu/x/{det}.fits,"
        f"spherex_qr2,{t_min},{t_min + 0.001},{did},0.97,"
        '{"aws": {"bucket_name": "b", "key": "k"}},,'
    )


def csv_body(*rows):
    return "\n".join([HEADER, *rows]) + "\n"


class Clock:
    def __init__(self):
        self.now = 1_000_000.0

    def time(self):
        return self.now

    def monotonic(self):
        return self.now


@pytest.fixture
def clock(monkeypatch):
    fake = Clock()
    monkeypatch.setattr(store, "time", fake)
    return fake


@pytest.fixture(autouse=True)
def clean_cache():
    store._memory_cache.clear()
    yield
    store._memory_cache.clear()


def make_gateway(handler, clock=None, **settings):
    gateway = SPHERExDataGateway(
        transport=httpx.MockTransport(handler),
        sleep=lambda _s: None,
        monotonic=(clock.monotonic if clock else None),
    )
    if settings:
        gateway.settings = gateway.settings.model_copy(update=settings)
    return gateway


class Counter:
    def __init__(self, respond):
        self.requests = []
        self.respond = respond

    def __call__(self, request):
        self.requests.append(request)
        return self.respond(request)


def ok(request):
    return httpx.Response(200, text=csv_body(csv_row()))


def test_columns_are_mapped_from_the_real_archive_shape():
    gateway = make_gateway(Counter(ok), irsa_collections="spherex_qr2")
    item = gateway.search(133.8, -7.2, 10.0)["items"][0]
    assert item["product_id"] == "ivo://irsa.ipac/spherex_qr2?2025W44_2B_0322_4/D3"
    assert item["obs_id"] == "2025W44_2B_0322_4"
    assert item["detector"] == 3
    assert item["wave_min_um"] == pytest.approx(1.0)
    assert item["wave_max_um"] == pytest.approx(1.3)
    assert item["date_obs"].startswith("2025-")
    assert item["t_min_mjd"] == pytest.approx(60800.5)


def test_one_exposure_yields_one_item_per_detector():
    rows = [
        csv_row(did=f"ivo://irsa.ipac/spherex_qr2?e/D{n}", det=f"SPHEREx-D{n}") for n in (1, 2, 3)
    ]
    gateway = make_gateway(
        Counter(lambda r: httpx.Response(200, text=csv_body(*rows))),
        irsa_collections="spherex_qr2",
    )
    items = gateway.search(1.0, 2.0, 10.0)["items"]
    assert sorted(i["detector"] for i in items) == [1, 2, 3]
    assert len({i["product_id"] for i in items}) == 3


def test_duplicate_products_across_collections_are_collapsed():
    gateway = make_gateway(Counter(ok), irsa_collections="spherex_qr2,spherex_qr2_deep")
    assert gateway.search(1.0, 2.0, 10.0)["count"] == 1


def test_searches_that_differ_only_in_time_range_query_the_archive_twice():
    handler = Counter(ok)
    gateway = make_gateway(handler, irsa_collections="spherex_qr2")
    gateway.search(1.0, 2.0, 10.0, t_min_mjd=60000.0, t_max_mjd=60100.0)
    gateway.search(1.0, 2.0, 10.0, t_min_mjd=60500.0, t_max_mjd=60600.0)
    assert len(handler.requests) == 2
    assert "TIME=60500" in str(handler.requests[1].url)


def test_identical_searches_hit_the_cache():
    handler = Counter(ok)
    gateway = make_gateway(handler, irsa_collections="spherex_qr2")
    gateway.search(1.0, 2.0, 10.0)
    again = gateway.search(1.0, 2.0, 10.0)
    assert len(handler.requests) == 1
    assert again["cached"] is True


def test_partial_failure_is_requeried_after_sixty_seconds(clock):
    def respond(request):
        if "spherex_qr2_deep" in str(request.url):
            return httpx.Response(400, text="bad collection")
        return httpx.Response(200, text=csv_body(csv_row()))

    handler = Counter(respond)
    gateway = make_gateway(handler, clock, irsa_collections="spherex_qr2,spherex_qr2_deep")
    first = gateway.search(1.0, 2.0, 10.0)
    assert first["warnings"]
    seen = len(handler.requests)
    clock.now += 30
    gateway.search(1.0, 2.0, 10.0)
    assert len(handler.requests) == seen
    clock.now += 31
    gateway.search(1.0, 2.0, 10.0)
    assert len(handler.requests) > seen


def test_archive_down_is_negatively_cached(clock):
    handler = Counter(lambda r: httpx.Response(503))
    gateway = make_gateway(handler, clock, irsa_collections="spherex_qr2")
    with pytest.raises(ArchiveUnavailableError):
        gateway.search(1.0, 2.0, 10.0)
    seen = len(handler.requests)
    clock.now += 10
    with pytest.raises(ArchiveUnavailableError):
        gateway.search(1.0, 2.0, 10.0)
    assert len(handler.requests) == seen
    clock.now += 60
    with pytest.raises(ArchiveUnavailableError):
        gateway.search(1.0, 2.0, 10.0)
    assert len(handler.requests) > seen


def test_a_400_is_never_retried():
    handler = Counter(lambda r: httpx.Response(400, text="nope"))
    gateway = make_gateway(handler, irsa_collections="spherex_qr2")
    with pytest.raises(ArchiveUnavailableError):
        gateway.search(1.0, 2.0, 10.0)
    assert len(handler.requests) == 1


def test_a_503_is_retried_once_then_succeeds():
    answers = iter([httpx.Response(503), httpx.Response(200, text=csv_body(csv_row()))])
    handler = Counter(lambda r: next(answers))
    gateway = make_gateway(handler, irsa_collections="spherex_qr2")
    assert gateway.search(1.0, 2.0, 10.0)["count"] == 1
    assert len(handler.requests) == 2


def test_a_connection_error_is_retried_once():
    def respond(request):
        raise httpx.ConnectError("refused")

    handler = Counter(respond)
    gateway = make_gateway(handler, irsa_collections="spherex_qr2")
    with pytest.raises(ArchiveUnavailableError):
        gateway.search(1.0, 2.0, 10.0)
    assert len(handler.requests) == 2


def test_unknown_collection_is_rejected_without_outbound_requests():
    handler = Counter(ok)
    gateway = make_gateway(handler)
    with pytest.raises(InvalidCollectionError):
        gateway.search(1.0, 2.0, 10.0, collections=["not_a_collection"])
    assert handler.requests == []


def test_total_deadline_stops_further_collections(clock):
    def respond(request):
        clock.now += 30
        raise httpx.ReadTimeout("slow")

    handler = Counter(respond)
    gateway = make_gateway(
        handler, clock, irsa_collections="a,b,c,d", irsa_search_deadline_seconds=45.0
    )
    with pytest.raises(ArchiveUnavailableError) as info:
        gateway.search(1.0, 2.0, 10.0, collections=["a", "b", "c", "d"])
    assert len(handler.requests) == 2
    assert "deadline" in str(info.value).lower()


def test_hitting_maxrec_adds_a_warning():
    rows = [csv_row(did=f"ivo://x/{n}", obs=f"o{n}") for n in range(3)]
    gateway = make_gateway(
        Counter(lambda r: httpx.Response(200, text=csv_body(*rows))),
        irsa_collections="spherex_qr2",
    )
    result = gateway.search(1.0, 2.0, 10.0, maxrec=3)
    assert any("maxrec" in w.lower() for w in result["warnings"])


def test_memory_cache_never_exceeds_its_cap(monkeypatch, clock):
    monkeypatch.setattr(store, "MEMORY_CACHE_MAX_ENTRIES", 5)
    for n in range(20):
        store.cache_set(f"k{n}", "v", 100)
    assert len(store._memory_cache) <= 5
    clock.now += 1000
    store.cache_set("fresh", "v", 100)
    assert list(store._memory_cache) == ["fresh"]


def test_search_endpoint_returns_422_for_unknown_collection(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app
    from app.routers import observations

    handler = Counter(ok)
    monkeypatch.setattr(observations, "gateway", make_gateway(handler))
    response = TestClient(app).post(
        "/api/v1/observations/search",
        json={"ra_deg": 1.0, "dec_deg": 2.0, "collections": ["nope"]},
    )
    assert response.status_code == 422
    assert handler.requests == []


def test_default_collections_come_from_configuration():
    assert get_settings().collection_list


TAP_CSV = (
    "obs_collection,tmax\n"
    "spherex_qr3,61318.0\nspherex_qr2,61241.0\nspherex_qr2_cal,\nspherex_qr3_cal,\n"
    "spherex_qr4,61500.0\nsomething_else,61900.0\n"
)


@pytest.fixture
def fresh_discovery():
    from app.services.sia2_gateway import reset_discovery

    reset_discovery()
    yield
    reset_discovery()


def discovery_handler(requests, tap_status=200):
    def handler(request):
        requests.append(request)
        if request.url.path.endswith("/TAP/sync"):
            return httpx.Response(tap_status, text=TAP_CSV)
        return httpx.Response(200, text=csv_body(csv_row()))

    return handler


def test_a_new_collection_is_used_without_changing_code(fresh_discovery):
    requests = []
    gateway = make_gateway(
        discovery_handler(requests), irsa_collections="spherex_qr2", discover_collections=True
    )
    info = gateway.collection_info(wait=True)
    assert info["source"] == "irsa"
    assert info["used"] == ["spherex_qr4", "spherex_qr3", "spherex_qr2"]
    gateway.search(1.0, 2.0, 10.0)
    searched = [r.url.params["COLLECTION"] for r in requests if "COLLECTION" in r.url.params]
    assert searched == ["spherex_qr4", "spherex_qr3", "spherex_qr2"]


def test_discovery_is_cached_for_a_day(fresh_discovery):
    requests = []
    gateway = make_gateway(
        discovery_handler(requests), irsa_collections="spherex_qr2", discover_collections=True
    )
    gateway.collection_info(wait=True)
    gateway.collection_info()
    assert sum(r.url.path.endswith("/TAP/sync") for r in requests) == 1


def test_with_irsa_down_the_configured_list_is_used_and_flagged(fresh_discovery):
    requests = []
    gateway = make_gateway(
        discovery_handler(requests, tap_status=503),
        irsa_collections="spherex_qr2,spherex_qr3", discover_collections=True,
    )
    info = gateway.collection_info(wait=True)
    assert info["source"] == "configured" and info["used"] == ["spherex_qr2", "spherex_qr3"]


def test_unknown_collections_are_still_rejected_with_discovery_on(fresh_discovery):
    gateway = make_gateway(
        discovery_handler([]), irsa_collections="spherex_qr2", discover_collections=True
    )
    gateway.collection_info(wait=True)
    with pytest.raises(InvalidCollectionError):
        gateway.search(1.0, 2.0, 10.0, collections=["spherex_qr9"])


def test_dois_come_from_a_data_table_and_unknown_releases_have_a_neutral_text():
    from app.services.evidence import SPHEREX_DOIS, build_report

    assert SPHEREX_DOIS["spherex_qr3"] == "10.26131/IRSA805"
    report = build_report(
        {"payload": {"observations": [{"collection": "spherex_qr9", "obs_id": "x"}]}}
    )
    assert report["references"]["collection_dois"] == {"spherex_qr9": "see IRSA documentation"}


def test_a_request_never_waits_for_the_slow_discovery(fresh_discovery):
    import threading

    release = threading.Event()
    requests = []

    def slow(request):
        requests.append(request)
        if request.url.path.endswith("/TAP/sync"):
            release.wait(5)
            return httpx.Response(200, text=TAP_CSV)
        return httpx.Response(200, text=csv_body(csv_row()))

    gateway = make_gateway(slow, irsa_collections="spherex_qr2", discover_collections=True)
    info = gateway.collection_info()
    assert info["source"] == "configured"
    assert gateway.search(1.0, 2.0, 10.0)["count"] == 1
    release.set()
