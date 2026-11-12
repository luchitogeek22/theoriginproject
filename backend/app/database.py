"""SQLAlchemy engine/session. SQLite by default; Postgres via DATABASE_URL."""

import os
from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings
from app.logging import get_logger

log = get_logger("database")


class Base(DeclarativeBase):
    pass


def _normalize_postgres_url(url: str) -> str:
    """Accept Heroku-style postgres:// URLs (SQLAlchemy wants postgresql://).

    Railway provides postgresql:// natively; this only guards copy-pasted
    variants from other providers.
    """
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


def _build_engine():
    settings = get_settings()
    url = _normalize_postgres_url(settings.database_url)
    kwargs: dict = {"future": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(url, **kwargs)


engine = _build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app import models  # noqa: F401
    from app.config import get_settings

    url = get_settings().database_url
    if url.startswith("sqlite:///"):
        path = url[len("sqlite:///") :]
        parent = os.path.dirname(os.path.abspath(path))
        os.makedirs(parent, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    _ensure_column("research_sessions", "verification_hash", "VARCHAR(64) DEFAULT ''")
    _ensure_column("research_sessions", "user_id", "VARCHAR(64)")
    _ensure_column("candidates", "user_id", "VARCHAR(64)")
    enable_row_level_security(engine)


def rls_statements(table_names) -> list[str]:
    return [
        'ALTER TABLE "{}" ENABLE ROW LEVEL SECURITY'.format(name.replace('"', '""'))
        for name in table_names
    ]


def enable_row_level_security(eng) -> list[str]:
    # Supabase serves the public schema over REST, so tables without RLS are open to the anon key.
    # Only tables still lacking RLS are altered: ALTER TABLE locks and init_db() runs per request.
    if eng.dialect.name != "postgresql":
        return []
    names = [t.name for t in Base.metadata.sorted_tables]
    try:
        with eng.begin() as conn:
            rows = conn.execute(
                text(
                    "SELECT c.relname FROM pg_class c "
                    "WHERE c.relnamespace = current_schema()::text::regnamespace "
                    "AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity "
                    "AND c.relname = ANY(:names)"
                ),
                {"names": names},
            )
            pending = [row[0] for row in rows]
            for statement in rls_statements(pending):
                conn.execute(text(statement))
    except Exception as exc:  # noqa: BLE001
        log.error("could not enable row level security: %s", exc)
        return []
    if pending:
        log.info("row level security enabled on: %s", ", ".join(pending))
    return pending


def _ensure_column(table: str, column: str, ddl_type: str) -> None:
    """Lightweight migration: add a column to databases created before it
    existed (SQLite and Postgres dialects)."""
    from sqlalchemy import inspect, text

    try:
        columns = [c["name"] for c in inspect(engine).get_columns(table)]
    except Exception:  # noqa: BLE001 - table missing; create_all already handled it
        return
    if column in columns:
        return
    guard = "" if engine.dialect.name == "sqlite" else "IF NOT EXISTS "
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {guard}{column} {ddl_type}"))
