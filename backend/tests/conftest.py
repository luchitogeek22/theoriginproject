"""Isolate the test suite from every configured database, cache and service.

The SQLAlchemy engine is built when `app.database` is first imported, so the
environment must be fixed here, before any test module imports the app. Values
are assigned unconditionally: a DATABASE_URL (or REDIS_URL, SUPABASE_*) coming
from the shell or from a .env file must never reach a test.
"""

import atexit
import os
import shutil
import tempfile

_SCRATCH = tempfile.mkdtemp(prefix="origin-tests-")
atexit.register(shutil.rmtree, _SCRATCH, ignore_errors=True)

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
    """Abort the whole session if isolation did not take effect."""
    from app.config import get_settings

    get_settings.cache_clear()
    url = get_settings().database_url
    if not url.startswith("sqlite:///") or _SCRATCH not in url:
        raise RuntimeError(
            "Test isolation failed: refusing to run against a non-temporary database."
        )
