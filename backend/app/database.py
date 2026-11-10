"""SQLAlchemy engine/session. SQLite by default; Postgres via DATABASE_URL."""

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def _build_engine():
    settings = get_settings()
    url = settings.database_url
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
