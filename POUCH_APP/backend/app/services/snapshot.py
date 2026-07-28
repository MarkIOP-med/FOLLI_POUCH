"""Builds the device snapshot shared by the roster, the SSE stream and the detail screen.

One builder, so the board and the device screen can never disagree about a pouch.
"""

from __future__ import annotations

import sqlite3
import time

from ..core.pressure import (
    CONTROLLER_TOLERANCE_MMHG,
    ZoneStatus,
    effective_mmhg,
    fsr_reading,
    trim_is_meaningful,
    zone_status,
)
from ..core.zones import ZONES
from ..repositories import app_settings, audit
from ..repositories import patients as patients_repo
from ..transport.registry import DeviceRuntime
from .alerts import raise_zone_alerts

MANIFOLD_FAULT_SECONDS = 30


def _mask_national_id(value: str | None) -> str | None:
    """This screen may live on a wall in a clinical space; show the last 4 only."""
    return f"•••••{value[-4:]}" if value else None


def _patient_summary(conn: sqlite3.Connection, patient_id: int) -> dict | None:
    row = conn.execute(
        "SELECT id, mrn, full_name, national_id FROM patients WHERE id = ?",
        (patient_id,),
    ).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "mrn": row["mrn"],
        "full_name": row["full_name"],
        "national_id_masked": _mask_national_id(row["national_id"]),
    }


def _zone_view(
    runtime: DeviceRuntime,
    zone: str,
    live: dict | None,
    prescriptions: dict[str, dict],
    ceiling: int,
    trim_range: int,
    now: float,
) -> dict:
    actual = live["actual"] if live else None

    if runtime.service_mode or runtime.patient_id is None:
        prescribed = runtime.setpoints.get(zone, 0)
        trim = 0
        effective = min(prescribed, ceiling)
    else:
        rx = prescriptions.get(zone, {})
        prescribed = rx.get("prescribed_mmhg", 0)
        trim = rx.get("patient_trim_pct", 0)
        effective = effective_mmhg(prescribed, trim, ceiling, trim_range)

    if actual is None:
        status = ZoneStatus.NO_DATA
    else:
        in_band = abs(actual - effective) <= CONTROLLER_TOLERANCE_MMHG
        band_since = runtime.note_band(zone, in_band)
        status = zone_status(actual, effective, band_since, now, runtime.flat_since(zone))

    rx = prescriptions.get(zone, {})
    return {
        "zone": zone,
        "prescribed_mmhg": prescribed,
        "trim_pct": trim,
        "trim_meaningful": trim_is_meaningful(prescribed, trim_range),
        "effective_mmhg": effective,
        "actual_mmhg": actual,
        "status": status,
        "massage_level": rx.get("massage_level", 0),
        "massage_seconds": rx.get("massage_seconds", 30),
        # EAR FSR channels are stubbed to 0 in firmware — 'not implemented', which is
        # not the same thing as a fault.
        "fsr_l": fsr_reading(live["fsr_l"], zone != "EAR") if live else None,
        "fsr_r": fsr_reading(live["fsr_r"], zone != "EAR") if live else None,
    }


def build(
    runtime: DeviceRuntime,
    conn: sqlite3.Connection,
    include_technical: bool = False,
) -> dict:
    config = app_settings.get(conn)
    ceiling = config.max_pressure_mmhg
    trim_range = config.trim_range_pct

    patient = (
        _patient_summary(conn, runtime.patient_id)
        if runtime.patient_id is not None
        else None
    )
    prescriptions = (
        patients_repo.prescriptions_by_zone(conn, runtime.patient_id)
        if runtime.patient_id is not None
        else {}
    )

    frame = runtime.last_frame
    now = time.time()

    zones = [
        _zone_view(
            runtime,
            zone,
            frame["zones"][zone] if frame else None,
            prescriptions,
            ceiling,
            trim_range,
            now,
        )
        for zone in ZONES
    ]

    raise_zone_alerts(conn, runtime, zones)

    snapshot = {
        "id": runtime.device_id,
        "label": runtime.label,
        "transport": runtime.transport,
        "port": runtime.port,
        "connected": runtime.connected,
        "rate_hz": runtime.rate_hz,
        # None until the firmware gains a `v` command: Gen4 is a byte-for-byte copy
        # of Gen3 and prints the Gen3 banner, so a board cannot identify itself.
        "fw_version": runtime.fw_version,
        "error": runtime.link.error if runtime.link else None,
        "service_mode": runtime.service_mode,
        "session_id": runtime.session_id,
        "session_started_at": runtime.session_started_at,
        "session_elapsed_s": (
            now - runtime.session_started_at if runtime.session_started_at else None
        ),
        "patient": patient,
        "zones": zones,
        "ceiling_mmhg": ceiling,
        "trim_range_pct": trim_range,
        "alerts": audit.unacked_alerts(conn, runtime.device_id),
        "manifold_mmhg": frame["manifold"] if frame else None,
        "manifold_fault": (
            runtime.manifold_flat_since is not None
            and (now - runtime.manifold_flat_since) > MANIFOLD_FAULT_SECONDS
        ),
        # The mock shows pump duty, purge-valve state and four valve LEDs. None of
        # that is in the telemetry CSV — serial.ino emits only time, targets,
        # actuals, manifold and FSRs. Rather than invent plausible indicators, the
        # panel reports them as not-reported and the gap goes on the firmware list.
        "hardware": {
            "reported": False,
            "pump": None,
            "pump_duty_pct": None,
            "purge_valve": None,
            "valves": {zone: None for zone in ZONES},
            "note": "firmware does not report pump or valve state in telemetry",
        },
        # The pump charges the shared manifold to the highest commanded target
        # before equalising into each pad.
        "manifold_target_mmhg": max((z["effective_mmhg"] for z in zones), default=0),
    }

    if include_technical:
        snapshot["technical"] = {
            "log_tail": runtime.log_tail[-25:],
            "raw_frame": frame,
        }

    return snapshot
