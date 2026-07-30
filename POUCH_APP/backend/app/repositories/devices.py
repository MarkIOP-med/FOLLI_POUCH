"""Devices, sessions and telemetry rows."""

from __future__ import annotations

import sqlite3
import time

# ── devices ─────────────────────────────────────────────────────────────────

def list_all(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("SELECT * FROM devices ORDER BY id").fetchall()


def exists(conn: sqlite3.Connection, device_id: str) -> bool:
    return conn.execute("SELECT 1 FROM devices WHERE id = ?", (device_id,)).fetchone() is not None


def create(
    conn: sqlite3.Connection, device_id: str, label: str, transport: str, port: str | None
) -> None:
    conn.execute(
        "INSERT INTO devices (id, label, transport, port) VALUES (?,?,?,?)",
        (device_id, label, transport, port),
    )


def delete(conn: sqlite3.Connection, device_id: str) -> None:
    conn.execute("DELETE FROM devices WHERE id = ?", (device_id,))


def touch_last_seen(conn: sqlite3.Connection, device_id: str) -> None:
    conn.execute("UPDATE devices SET last_seen = ? WHERE id = ?", (time.time(), device_id))


# ── sessions ────────────────────────────────────────────────────────────────

def start_session(
    conn: sqlite3.Connection, device_id: str, patient_id: int | None
) -> int:
    cursor = conn.execute(
        "INSERT INTO sessions (device_id, patient_id, started_at) VALUES (?,?,?)",
        (device_id, patient_id, time.time()),
    )
    return int(cursor.lastrowid)


def end_session(conn: sqlite3.Connection, session_id: int, ended_by: str) -> None:
    conn.execute(
        "UPDATE sessions SET ended_at = ?, ended_by = ? WHERE id = ?",
        (time.time(), ended_by, session_id),
    )


def sessions_for_patient(conn: sqlite3.Connection, patient_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT s.id, s.device_id, s.started_at, s.ended_at, s.ended_by,"
        " (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count"
        " FROM sessions s WHERE s.patient_id = ? ORDER BY s.started_at DESC",
        (patient_id,),
    ).fetchall()
    return [dict(row) for row in rows]


# ── telemetry ───────────────────────────────────────────────────────────────

def write_telemetry(
    conn: sqlite3.Connection, session_id: int, ts: float, rows: list[tuple]
) -> None:
    """rows: (zone, target, actual, manifold)."""
    conn.executemany(
        "INSERT INTO telemetry (session_id, ts, zone, target, actual, manifold)"
        " VALUES (?,?,?,?,?,?)",
        [(session_id, ts, *row) for row in rows],
    )
