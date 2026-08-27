"""Patients and their prescriptions."""

from __future__ import annotations

import sqlite3
import time

from ..core.pressure import clamp
from ..core.zones import ZONES
from ..schemas.patient import PrescriptionIn

_BLANK_RX = {
    "prescribed_mmhg": 0,
    "patient_trim_pct": 0,
    "massage_level": 0,
    "massage_seconds": 30,
}


def _current_year() -> int:
    return time.gmtime().tm_year


def get(conn: sqlite3.Connection, patient_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    if row is None:
        return None

    stored = {
        rx["zone"]: dict(rx)
        for rx in conn.execute(
            "SELECT zone, prescribed_mmhg, patient_trim_pct, massage_level,"
            " massage_seconds FROM prescriptions WHERE patient_id = ?",
            (patient_id,),
        ).fetchall()
    }

    birth_year = row["birth_year"]
    return {
        "id": row["id"],
        "mrn": row["mrn"],
        "full_name": row["full_name"],
        "national_id": row["national_id"],
        "created_at": row["created_at"],
        "gender": row["gender"],
        "birth_year": birth_year,
        # Derived rather than stored, so it cannot go stale in the record.
        "age": (_current_year() - birth_year) if birth_year else None,
        "protocol": row["protocol"],
        "treatment_start_date": row["treatment_start_date"],
        "treatment_number": row["treatment_number"],
        # Always four zones, in canonical order, even if a row is missing.
        "prescriptions": [
            {**_BLANK_RX, **stored.get(zone, {}), "zone": zone} for zone in ZONES
        ],
    }


def search(conn: sqlite3.Connection, query: str = "") -> list[int]:
    sql = "SELECT id FROM patients"
    args: tuple = ()
    if query:
        sql += " WHERE full_name LIKE ? OR mrn LIKE ?"
        args = (f"%{query}%", f"%{query}%")
    sql += " ORDER BY full_name"
    return [row["id"] for row in conn.execute(sql, args).fetchall()]


def create(conn: sqlite3.Connection, full_name: str, national_id: str | None) -> int:
    """Insert and return the new id.

    MRN is derived from the AUTOINCREMENT rowid *after* insert, never from
    MAX(id)+1. MAX(id)+1 reuses numbers once a patient is deleted, which in a
    clinical record means a retired MRN silently reappears on a different person —
    and eventually trips the UNIQUE constraint as a 500.
    """
    cursor = conn.execute(
        "INSERT INTO patients (mrn, full_name, national_id, created_at) VALUES (?,?,?,?)",
        ("", full_name.strip(), national_id or None, time.time()),
    )
    patient_id = int(cursor.lastrowid)
    conn.execute(
        "UPDATE patients SET mrn = ? WHERE id = ?", (f"{patient_id:06d}", patient_id)
    )
    return patient_id


def update_identity(
    conn: sqlite3.Connection,
    patient_id: int,
    full_name: str,
    national_id: str | None,
    demographics: dict | None = None,
) -> None:
    conn.execute(
        "UPDATE patients SET full_name = ?, national_id = ? WHERE id = ?",
        (full_name.strip(), national_id or None, patient_id),
    )
    if not demographics:
        return

    # Only the keys actually supplied are written, so a partial update from one
    # screen cannot blank fields owned by another.
    allowed = ("gender", "birth_year", "protocol", "treatment_start_date",
               "treatment_number")
    updates = {k: v for k, v in demographics.items() if k in allowed}
    if updates:
        assignments = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE patients SET {assignments} WHERE id = ?",
            (*updates.values(), patient_id),
        )


def delete(conn: sqlite3.Connection, patient_id: int) -> None:
    row = conn.execute(
        "SELECT is_default FROM patients WHERE id = ?", (patient_id,)
    ).fetchone()
    if row is not None and row["is_default"]:
        raise ValueError("the NO_USER default patient cannot be deleted")
    conn.execute("DELETE FROM patients WHERE id = ?", (patient_id,))


def default_patient_id(conn: sqlite3.Connection) -> int | None:
    """The reserved NO_USER patient's id, or None if it was never seeded."""
    row = conn.execute("SELECT id FROM patients WHERE is_default = 1").fetchone()
    return int(row["id"]) if row else None


def delete_all_except_default(conn: sqlite3.Connection) -> int:
    """Factory reset: wipe the patient archive, keeping only NO_USER. Returns the
    number of patients removed (prescriptions cascade via the FK)."""
    cur = conn.execute("DELETE FROM patients WHERE is_default = 0")
    return cur.rowcount


def reset_default_regime(conn: sqlite3.Connection) -> None:
    """Restore NO_USER's own prescription to the factory regime and clear its trims,
    so a factory reset returns the default profile to its shipped values."""
    from ..core.zones import DEFAULT_REGIME

    pid = default_patient_id(conn)
    if pid is None:
        return
    now = time.time()
    for zone, mmhg in DEFAULT_REGIME.items():
        conn.execute(
            "INSERT INTO prescriptions (patient_id, zone, prescribed_mmhg,"
            " patient_trim_pct, updated_at) VALUES (?,?,?,0,?)"
            " ON CONFLICT(patient_id, zone) DO UPDATE SET"
            "   prescribed_mmhg = excluded.prescribed_mmhg,"
            "   patient_trim_pct = 0, updated_at = excluded.updated_at",
            (pid, zone, mmhg, now),
        )


def write_prescriptions(
    conn: sqlite3.Connection,
    patient_id: int,
    items: list[PrescriptionIn],
    ceiling: int,
) -> None:
    """Writes prescribed_mmhg only. patient_trim_pct is preserved untouched."""
    for item in items:
        conn.execute(
            "INSERT INTO prescriptions (patient_id, zone, prescribed_mmhg,"
            " massage_level, massage_seconds, updated_at) VALUES (?,?,?,?,?,?)"
            " ON CONFLICT(patient_id, zone) DO UPDATE SET"
            "   prescribed_mmhg = excluded.prescribed_mmhg,"
            "   massage_level   = excluded.massage_level,"
            "   massage_seconds = excluded.massage_seconds,"
            "   updated_at      = excluded.updated_at",
            (
                patient_id,
                item.zone,
                int(clamp(item.prescribed_mmhg, 0, ceiling)),
                item.massage_level,
                item.massage_seconds,
                time.time(),
            ),
        )


def set_zone_pressure(
    conn: sqlite3.Connection, patient_id: int, zone: str, mmhg: int
) -> int | None:
    """Set one zone's prescription; returns the previous value."""
    before = conn.execute(
        "SELECT prescribed_mmhg FROM prescriptions WHERE patient_id = ? AND zone = ?",
        (patient_id, zone),
    ).fetchone()

    conn.execute(
        "INSERT INTO prescriptions (patient_id, zone, prescribed_mmhg, updated_at)"
        " VALUES (?,?,?,?)"
        " ON CONFLICT(patient_id, zone) DO UPDATE SET"
        "   prescribed_mmhg = excluded.prescribed_mmhg,"
        "   updated_at = excluded.updated_at",
        (patient_id, zone, mmhg, time.time()),
    )
    return before["prescribed_mmhg"] if before else None


def set_trim(conn: sqlite3.Connection, patient_id: int, zone: str, trim_pct: int) -> None:
    """Write patient_trim_pct only — never folded into prescribed_mmhg."""
    conn.execute(
        "UPDATE prescriptions SET patient_trim_pct = ?, updated_at = ?"
        " WHERE patient_id = ? AND zone = ?",
        (trim_pct, time.time(), patient_id, zone),
    )


def set_vibration(
    conn: sqlite3.Connection,
    patient_id: int,
    zone: str,
    massage_level: int,
    massage_seconds: int | None,
) -> None:
    if massage_seconds is None:
        conn.execute(
            "UPDATE prescriptions SET massage_level = ?, updated_at = ?"
            " WHERE patient_id = ? AND zone = ?",
            (massage_level, time.time(), patient_id, zone),
        )
    else:
        conn.execute(
            "UPDATE prescriptions SET massage_level = ?, massage_seconds = ?,"
            " updated_at = ? WHERE patient_id = ? AND zone = ?",
            (massage_level, massage_seconds, time.time(), patient_id, zone),
        )


def reset_all(conn: sqlite3.Connection, patient_id: int) -> None:
    conn.execute(
        "UPDATE prescriptions SET prescribed_mmhg = 0, patient_trim_pct = 0,"
        " updated_at = ? WHERE patient_id = ?",
        (time.time(), patient_id),
    )


def promote_effective(
    conn: sqlite3.Connection, patient_id: int, zone: str, effective_mmhg: int
) -> None:
    """Promote an effective pressure to the prescription and consume the trim.

    Deliberately clears patient_trim_pct rather than leaving it to re-apply: that is
    what stops SET CURRENT AS DEFAULT from compounding (40 -> 44 -> 48.4 -> ...).
    """
    conn.execute(
        "UPDATE prescriptions SET prescribed_mmhg = ?, patient_trim_pct = 0,"
        " updated_at = ? WHERE patient_id = ? AND zone = ?",
        (effective_mmhg, time.time(), patient_id, zone),
    )


def prescriptions_by_zone(conn: sqlite3.Connection, patient_id: int) -> dict[str, dict]:
    rows = conn.execute(
        "SELECT zone, prescribed_mmhg, patient_trim_pct, massage_level, massage_seconds"
        " FROM prescriptions WHERE patient_id = ?",
        (patient_id,),
    ).fetchall()
    return {row["zone"]: dict(row) for row in rows}
