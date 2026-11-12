"""The test suite must never touch the configured database or storage."""

from pathlib import Path

from app.config import get_settings
from app.database import engine

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_database_is_a_throwaway_sqlite_outside_the_repo():
    url = get_settings().database_url
    assert url.startswith("sqlite:///"), url
    db_path = Path(url[len("sqlite:///"):]).resolve()
    assert BACKEND_DIR not in db_path.parents, db_path
    assert str(engine.url).startswith("sqlite"), engine.url


def test_storage_is_outside_the_repo():
    settings = get_settings()
    assert settings.storage_backend == "local"
    storage = Path(settings.local_storage_dir).resolve()
    assert BACKEND_DIR not in storage.parents, storage


def test_external_services_are_disabled():
    settings = get_settings()
    assert settings.redis_url == ""
    assert settings.supabase_url == ""
    assert settings.supabase_anon_key == ""
    assert settings.supabase_jwt_secret == ""
    assert settings.environment == "test"
