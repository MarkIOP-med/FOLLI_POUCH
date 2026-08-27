"""Clinical settings — ceiling, trim range, default massage duration.

Stored in the database rather than config because a clinician changes them, not a
deployment.
"""

from __future__ import annotations

import sqlite3

from ..schemas.settings import SettingsOut

_DEFAULTS = {
    "max_pressure_mmhg": 70,
    "trim_range_pct": 10,
    "default_massage_seconds": 30,
    "pressure_tolerance_mmhg": 3,
    "actuation_threshold_mmhg": 10,
    "telemetry_interval_ms": 250,
    "vib_pwm_1": 170,
    "vib_pwm_2": 215,
    "vib_pwm_3": 255,
}


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
        pressure_tolerance_mmhg=as_int("pressure_tolerance_mmhg"),
        actuation_threshold_mmhg=as_int("actuation_threshold_mmhg"),
        telemetry_interval_ms=as_int("telemetry_interval_ms"),
        vib_pwm_1=as_int("vib_pwm_1"),
        vib_pwm_2=as_int("vib_pwm_2"),
        vib_pwm_3=as_int("vib_pwm_3"),
    )


def update(conn: sqlite3.Connection, values: dict[str, int]) -> None:
    for key, value in values.items():
        conn.execute("UPDATE settings SET value = ? WHERE key = ?", (str(value), key))


#: Settings that are real firmware control variables (setvariable name -> field).
#: Distinct from the app-side clamps (ceiling, trim range), which the firmware
#: never sees.
FIRMWARE_VARS = {
    "PRESSURE_TOLERANCE": "pressure_tolerance_mmhg",
    "ACTUATION_THRESHOLD": "actuation_threshold_mmhg",
    "TELEMETRY_INTERVAL": "telemetry_interval_ms",
    "VIB_PWM_1": "vib_pwm_1",
    "VIB_PWM_2": "vib_pwm_2",
    "VIB_PWM_3": "vib_pwm_3",
}


def firmware_variables(settings: SettingsOut) -> dict[str, int]:
    """The {setvariable-name: value} pairs to push to a connected pouch."""
    return {name: getattr(settings, field) for name, field in FIRMWARE_VARS.items()}
