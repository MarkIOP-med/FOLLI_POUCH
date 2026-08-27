"""Connection handling and the FastAPI dependency.

Routes take `db: Connection = Depends(get_db)` rather than opening their own
connection, so no handler can leak one and every request has a single consistent
view of the database.
"""

from __future__ import annotations

import sqlite3
import time
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
        # First run only: seed a mock pouch so the app is usable with no hardware
        # attached. Guarded on an empty roster — not INSERT OR IGNORE — so deleting
        # the mock once real hardware is registered is a decision that sticks across
        # restarts instead of quietly reappearing every boot.
        count = conn.execute("SELECT COUNT(*) AS n FROM devices").fetchone()["n"]
        if count == 0:
            conn.execute(
                "INSERT INTO devices (id, label, transport, port) VALUES (?,?,?,?)",
                ("POUCH-MOCK", "Mock Pouch", "mock", None),
            )
        _seed_no_user(conn)
        conn.commit()


def _seed_no_user(conn: sqlite3.Connection) -> None:
    """Seed the reserved NO_USER patient — the factory-default profile the pouch is
    always checked out to unless the app picks a real patient. Idempotent: keyed on
    is_default, and its id/regime mirror the firmware's NO_USER (see core/zones.py)."""
    from ..core.zones import DEFAULT_REGIME, NO_USER_ID, NO_USER_NAME, ZONES

    exists = conn.execute(
        "SELECT 1 FROM patients WHERE is_default = 1"
    ).fetchone()
    if exists:
        return
    now = time.time()
    conn.execute(
        "INSERT INTO patients (id, mrn, full_name, national_id, is_default, created_at)"
        " VALUES (?,?,?,?,1,?)",
        (NO_USER_ID, NO_USER_NAME, NO_USER_NAME, None, now),
    )
    for zone in ZONES:
        conn.execute(
            "INSERT INTO prescriptions (patient_id, zone, prescribed_mmhg, updated_at)"
            " VALUES (?,?,?,?)",
            (NO_USER_ID, zone, DEFAULT_REGIME[zone], now),
        )
