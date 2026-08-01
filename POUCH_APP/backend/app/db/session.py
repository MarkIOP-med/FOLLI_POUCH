"""Connection handling and the FastAPI dependency.

Routes take `db: Connection = Depends(get_db)` rather than opening their own
connection, so no handler can leak one and every request has a single consistent
view of the database.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from ..config import settings
from .schema import DEFAULT_SETTINGS, MIGRATIONS, SCHEMA


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency — one connection per request, always closed."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def session_scope() -> Iterator[sqlite3.Connection]:
    """For use outside the request cycle (startup, background streaming)."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def _apply_migrations(conn: sqlite3.Connection) -> None:
    """Add any columns missing from an existing database.

    Checked against PRAGMA table_info rather than catching the duplicate-column
    error, so a genuine failure is not swallowed.
    """
    for table, column, ddl in MIGRATIONS:
        existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def init_db() -> None:
    with session_scope() as conn:
        conn.executescript(SCHEMA)
        _apply_migrations(conn)
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, value)
            )
        # A mock pouch always exists so the app is usable with no hardware attached.
        conn.execute(
            "INSERT OR IGNORE INTO devices (id, label, transport, port) VALUES (?,?,?,?)",
            ("POUCH-MOCK", "Mock Pouch", "mock", None),
        )
        conn.commit()
