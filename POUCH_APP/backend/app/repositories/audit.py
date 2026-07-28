"""Audit trail and the device event log."""

from __future__ import annotations

import json
import sqlite3
import time
from typing import Any, Literal

from ..config import settings

Severity = Literal["info", "warn", "alarm"]


def record(
    conn: sqlite3.Connection,
    action: str,
    entity: str,
    before: Any = None,
    after: Any = None,
    actor: str | None = None,
) -> None:
    """Append an audit row. Callers commit."""
    conn.execute(
        "INSERT INTO audit (actor, action, entity, before_json, after_json, ts)"
        " VALUES (?,?,?,?,?,?)",
        (
            actor or settings.default_actor,
            action,
            entity,
            json.dumps(before) if before is not None else None,
            json.dumps(after) if after is not None else None,
            time.time(),
        ),
    )


def log_event(
    conn: sqlite3.Connection,
    device_id: str,
    severity: Severity,
    code: str,
    detail: str = "",
    session_id: int | None = None,
) -> None:
    conn.execute(
        "INSERT INTO events (device_id, session_id, severity, code, detail, ts)"
        " VALUES (?,?,?,?,?,?)",
        (device_id, session_id, severity, code, detail, time.time()),
    )


def unacked_alerts(conn: sqlite3.Connection, device_id: str, limit: int = 20) -> list[dict]:
    """Only warn/alarm reach the alert strip.

    'connected', 'apply' and 'session_start' are log entries — surfacing them as
    alerts buries the one that matters under a wall of routine noise.
    """
    rows = conn.execute(
        "SELECT id, severity, code, detail, ts FROM events"
        " WHERE device_id = ? AND acked_at IS NULL"
        "   AND severity IN ('warn', 'alarm')"
        " ORDER BY ts DESC LIMIT ?",
        (device_id, limit),
    ).fetchall()
    return [dict(row) for row in rows]


def ack(conn: sqlite3.Connection, device_id: str, event_id: int) -> None:
    conn.execute(
        "UPDATE events SET acked_at = ? WHERE id = ? AND device_id = ?",
        (time.time(), event_id, device_id),
    )
