import os

import httpx
import pytest

from app.config import get_settings
from app.services import sia2_gateway, store

ALLOWED = "https://irsa.ipac.caltech.edu/ibe/data/spherex/x.fits"


def _boom(*args, **kwargs):
    raise AssertionError("open() must not be reached for a rejected key")


def test_absolute_key_is_rejected_without_opening_the_file(tmp_path, monkeypatch):
    secret = tmp_path / "secret.txt"
    secret.write_bytes(b"top secret")
    monkeypatch.setattr(store, "open", _boom, raising=False)
    with pytest.raises(ValueError):
        store.storage_get(str(secret))
    assert store.storage_exists(str(secret)) is False


@pytest.mark.parametrize("key", ["../x", "cutouts/../../x", "a/../../../etc/hosts", ""])
def test_traversal_keys_are_rejected(key, monkeypatch):
    monkeypatch.setattr(store, "open", _boom, raising=False)
    with pytest.raises(ValueError):
        store.storage_get(key)
    assert store.storage_exists(key) is False


def test_symlink_escaping_the_root_is_rejected(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_bytes(b"top secret")
    link = os.path.join(store.storage_root(), "escape")
    os.symlink(outside, link)
    try:
        with pytest.raises(ValueError):
            store.storage_get("escape/secret.txt")
        assert store.storage_exists("escape/secret.txt") is False
    finally:
        os.unlink(link)


def test_put_rejects_a_key_outside_the_root_and_writes_nothing(tmp_path):
    target = tmp_path / "planted.bin"
    with pytest.raises(ValueError):
        store.storage_put(f"../../../../../../{target}", b"x")
    assert not target.exists()


def test_valid_keys_still_round_trip():
    key = "cutouts/wp02_roundtrip.fits"
    assert store.storage_put(key, b"abc") == key
    assert store.storage_exists(key) is True
    assert store.storage_get(key) == b"abc"
    os.unlink(os.path.join(store.storage_root(), key))


def test_s3_keys_keep_their_previous_behaviour():
    assert store.storage_exists("s3://bucket/k") is False
    with pytest.raises(FileNotFoundError):
        store.storage_get("s3://bucket/k")


def _client_factory(monkeypatch, handler):
    real = httpx.Client
    seen: list[str] = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return handler(request)

    monkeypatch.setattr(
        sia2_gateway.httpx,
        "Client",
        lambda **kw: real(transport=httpx.MockTransport(wrapped), **kw),
    )
    return seen


def _gateway():
    return sia2_gateway.SPHERExDataGateway()


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1:1/",
        "http://irsa.ipac.caltech.edu/x.fits",
        "https://127.0.0.1/x.fits",
        "https://evil.example/x.fits",
        "https://irsa.ipac.caltech.edu.evil.example/x.fits",
        "https://evil.example/.ipac.caltech.edu",
        "https://irsa.ipac.caltech.edu@evil.example/x.fits",
        "https://irsa.ipac.caltech.edu:8443/x.fits",
        "file:///etc/passwd",
    ],
)
def test_disallowed_urls_never_open_a_socket(url, monkeypatch):
    from app.services.sia2_gateway import DisallowedDownloadError

    def no_client(**kwargs):
        raise AssertionError("no HTTP client may be created for a rejected URL")

    monkeypatch.setattr(sia2_gateway.httpx, "Client", no_client)
    with pytest.raises(DisallowedDownloadError):
        _gateway().download(url)


def test_redirect_to_a_disallowed_host_is_rejected_before_following(monkeypatch):
    from app.services.sia2_gateway import DisallowedDownloadError

    def handler(request):
        return httpx.Response(302, headers={"location": "https://169.254.169.254/latest"})

    seen = _client_factory(monkeypatch, handler)
    with pytest.raises(DisallowedDownloadError):
        _gateway().download(ALLOWED)
    assert seen == [ALLOWED]


def test_redirect_to_http_is_rejected(monkeypatch):
    from app.services.sia2_gateway import DisallowedDownloadError

    def handler(request):
        return httpx.Response(302, headers={"location": "http://irsa.ipac.caltech.edu/x"})

    _client_factory(monkeypatch, handler)
    with pytest.raises(DisallowedDownloadError):
        _gateway().download(ALLOWED)


def test_redirect_within_the_allowed_domain_is_followed(monkeypatch):
    final = "https://irsa.ipac.caltech.edu/final.fits"

    def handler(request):
        if str(request.url) == ALLOWED:
            return httpx.Response(302, headers={"location": "/final.fits"})
        return httpx.Response(200, content=b"FITSDATA")

    seen = _client_factory(monkeypatch, handler)
    data, final_url = _gateway().download(ALLOWED)
    assert data == b"FITSDATA"
    assert final_url == final
    assert seen == [ALLOWED, final]


def test_redirect_loops_are_bounded(monkeypatch):
    def handler(request):
        return httpx.Response(302, headers={"location": ALLOWED})

    seen = _client_factory(monkeypatch, handler)
    with pytest.raises(sia2_gateway.ArchiveUnavailableError):
        _gateway().download(ALLOWED)
    assert len(seen) <= 6


def test_size_limit_still_applies(monkeypatch):
    monkeypatch.setattr(get_settings(), "download_limit_mb", 0)
    _client_factory(monkeypatch, lambda r: httpx.Response(200, content=b"x" * 10))
    with pytest.raises(ValueError):
        _gateway().download(ALLOWED)


def test_rls_statements_quote_each_table():
    from app.database import rls_statements

    assert rls_statements(["observations", 'we"ird']) == [
        'ALTER TABLE "observations" ENABLE ROW LEVEL SECURITY',
        'ALTER TABLE "we""ird" ENABLE ROW LEVEL SECURITY',
    ]
    assert rls_statements([]) == []


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def __iter__(self):
        return iter(self._rows)


class _FakeConn:
    def __init__(self, without_rls):
        self.without_rls = without_rls
        self.executed: list[str] = []

    def execute(self, statement, params=None):
        sql = str(statement)
        self.executed.append(sql)
        if sql.lstrip().lower().startswith("select"):
            wanted = set(params["names"])
            return _Rows([(n,) for n in self.without_rls if n in wanted])
        return _Rows([])


class _FakeEngine:
    def __init__(self, dialect_name, without_rls=()):
        self.dialect = type("D", (), {"name": dialect_name})()
        self.conn = _FakeConn(without_rls)

    def begin(self):
        conn = self.conn

        class _Ctx:
            def __enter__(self_inner):
                return conn

            def __exit__(self_inner, *exc):
                return False

        return _Ctx()


def test_enable_rls_alters_only_tables_that_lack_it():
    from app.database import Base, enable_row_level_security

    assert {t.name for t in Base.metadata.sorted_tables}
    engine = _FakeEngine("postgresql", without_rls={"candidates", "cutouts"})
    changed = enable_row_level_security(engine)
    assert sorted(changed) == ["candidates", "cutouts"]
    alters = [s for s in engine.conn.executed if s.startswith("ALTER TABLE")]
    assert len(alters) == 2


def test_enable_rls_takes_no_lock_when_everything_is_protected():
    from app.database import enable_row_level_security

    engine = _FakeEngine("postgresql", without_rls=())
    assert enable_row_level_security(engine) == []
    assert not [s for s in engine.conn.executed if s.startswith("ALTER TABLE")]


def test_enable_rls_is_a_no_op_outside_postgresql():
    from app.database import enable_row_level_security

    engine = _FakeEngine("sqlite")
    assert enable_row_level_security(engine) == []
    assert engine.conn.executed == []


def test_init_db_runs_on_sqlite_without_rls():
    from app import database

    database.init_db()
    assert database.enable_row_level_security(database.engine) == []
