"""Database schema.

Kept as one SQL script rather than an ORM: the schema is small, the queries are
explicit, and a clinical data model benefits from being readable at a glance.
If this grows past a handful of tables, introduce Alembic rather than hand-editing.
"""

SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Internal MRN is the key. national_id is optional and check-digit validated;
-- it is PHI and must never be the primary key.
CREATE TABLE IF NOT EXISTS patients (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mrn         TEXT UNIQUE NOT NULL,
    full_name   TEXT NOT NULL,
    national_id TEXT,
    created_at  REAL NOT NULL
);

-- prescribed_mmhg and patient_trim_pct are SEPARATE columns, deliberately.
-- Folding a trim back into the prescription compounds across sessions
-- (40 -> 44 -> 48.4 -> ...) and walks past the ceiling with nobody at fault.
CREATE TABLE IF NOT EXISTS prescriptions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id       INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    zone             TEXT NOT NULL,
    prescribed_mmhg  INTEGER NOT NULL DEFAULT 0,
    patient_trim_pct INTEGER NOT NULL DEFAULT 0,
    massage_level    INTEGER NOT NULL DEFAULT 0,
    massage_seconds  INTEGER NOT NULL DEFAULT 30,
    updated_at       REAL NOT NULL,
    UNIQUE (patient_id, zone)
);

CREATE TABLE IF NOT EXISTS devices (
    id         TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    transport  TEXT NOT NULL,          -- 'serial' | 'mock' | 'ble'
    port       TEXT,
    fw_version TEXT,
    last_seen  REAL
);

CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,  -- NULL = service mode
    started_at REAL NOT NULL,
    ended_at   REAL,
    ended_by   TEXT
);

CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id  TEXT REFERENCES devices(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
    severity   TEXT NOT NULL,          -- 'info' | 'warn' | 'alarm'
    code       TEXT NOT NULL,
    detail     TEXT,
    ts         REAL NOT NULL,
    acked_at   REAL
);

-- Downsampled deliberately; see config.telemetry_write_interval_s.
CREATE TABLE IF NOT EXISTS telemetry (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    ts         REAL NOT NULL,
    zone       TEXT NOT NULL,
    target     INTEGER,
    actual     INTEGER,
    manifold   INTEGER
);

-- Prescriptions are clinical records; changes must be attributable even without auth.
CREATE TABLE IF NOT EXISTS audit (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL,
    entity      TEXT NOT NULL,
    before_json TEXT,
    after_json  TEXT,
    ts          REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_device   ON events(device_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_unacked  ON events(device_id, acked_at, severity);
CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions(patient_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry(session_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_ts        ON audit(ts DESC);
"""

DEFAULT_SETTINGS = {
    "max_pressure_mmhg": "130",    # ceiling; admin-editable. 130 lets a full 125 mmHg
    #                                 regime be prescribed without changing anything (bench
    #                                 request 2026-08-25). Was 70 (the human-head limit) —
    #                                 lower it back to 70 before any human use.
    "trim_range_pct": "10",
    "default_massage_seconds": "30",
}

# Idempotent ALTER TABLE migrations, applied in order on every startup.
#
# Fields required by the 2026-07 redesign (diagnostics_ui_04 PAGE_01/03/04):
# the User Info and User Overview panels display them, so the screens cannot
# render without them. All nullable â€” existing records stay valid.
MIGRATIONS: list[tuple[str, str, str]] = [
    # (table, column, DDL)
    ("patients", "gender", "TEXT"),
    ("patients", "birth_year", "INTEGER"),
    ("patients", "protocol", "TEXT"),
    ("patients", "treatment_start_date", "REAL"),
    ("patients", "treatment_number", "INTEGER"),
    ("sessions", "planned_duration_s", "INTEGER"),
    ("sessions", "console_id", "TEXT"),
]
