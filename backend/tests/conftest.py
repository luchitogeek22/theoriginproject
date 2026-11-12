import atexit
import os
import shutil
import tempfile

_SCRATCH = tempfile.mkdtemp(prefix="origin-tests-")
atexit.register(shutil.rmtree, _SCRATCH, ignore_errors=True)

# The engine is built on first import of app.database, so this must run before any test imports the app.
os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DATABASE_URL": f"sqlite:///{_SCRATCH}/origin.db",
        "STORAGE_BACKEND": "local",
        "LOCAL_STORAGE_DIR": f"{_SCRATCH}/storage",
        "REDIS_URL": "",
        "SUPABASE_URL": "",
        "SUPABASE_ANON_KEY": "",
        "SUPABASE_JWT_SECRET": "",
    }
)


def pytest_configure(config):
    from app.config import get_settings

    get_settings.cache_clear()
    url = get_settings().database_url
    if not url.startswith("sqlite:///") or _SCRATCH not in url:
        raise RuntimeError(
            "Test isolation failed: refusing to run against a non-temporary database."
        )
