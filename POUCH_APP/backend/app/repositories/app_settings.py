"""Clinical settings — ceiling, trim range, default massage duration.

Stored in the database rather than config because a clinician changes them, not a
deployment.
"""

from __future__ import annotations

import sqlite3

from ..schemas.settings import SettingsOut

_DEFAULTS = {"max_pressure_mmhg": 70, "trim_range_pct": 10, "default_massage_seconds": 30}


def get(conn: sqlite3.Connection) -> SettingsOut:
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    stored = {row["key"]: row["value"] for row in rows}

    def as_int(key: str) -> int:
        try:
            return int(stored[key])
        except (KeyError, ValueError):
            return _DEFAULTS[key]

    return SettingsOut(
        max_pressure_mmhg=as_int("max_pressure_mmhg"),
        trim_range_pct=as_int("trim_range_pct"),
        default_massage_seconds=as_int("default_massage_seconds"),
    )


def update(conn: sqlite3.Connection, values: dict[str, int]) -> None:
    for key, value in values.items():
        conn.execute("UPDATE settings SET value = ? WHERE key = ?", (str(value), key))
