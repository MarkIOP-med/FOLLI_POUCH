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
    manifold_fault,
    trim_is_meaningful,
    zone_status,
)
from ..core.zones import ZONES
from ..repositories import app_settings, audit
from ..repositories import patients as patients_repo
from ..transport.registry import DeviceRuntime
from .alerts import raise_zone_alerts


def _mask_national_id(value: str | None) -> str | None:
    """This screen may live on a wall in a clinical space; show the last 4 only."""
    return f"•••••{value[-4:]}" if value else None


def _patient_summary(conn: sqlite3.Connection, patient_id: int) -> dict | None:
    full = patients_repo.get(conn, patient_id)
    if full is None:
        return None
    return {
        "id": full["id"],
        "mrn": full["mrn"],
        "full_name": full["full_name"],
        "national_id_masked": _mask_national_id(full["national_id"]),
        # The redesigned header and User Regime panel display these directly.
        "gender": full["gender"],
        "age": full["age"],
        "protocol": full["protocol"],
        "treatment_start_date": full["treatment_start_date"],
        "treatment_number": full["treatment_number"],
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
        # The flatline window arms from whichever is later: the reading going
        # flat, or the zone being commanded. A zone idle at 0 for ten minutes
        # must not read as a ten-minute flatline on the first frame after START.
        flat = runtime.flat_since(zone)
        commanded = runtime.note_commanded(zone, effective > 0)
        if flat is not None and commanded is not None:
            flat = max(flat, commanded)
        status = zone_status(actual, effective, band_since, now, flat)

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
        # This zone's own live massage countdown (seconds), independent of the
        # other zones — 0 when this zone isn't buzzing, None before any frame.
        "vibration_remaining_s": live.get("vibration_remaining_s") if live else None,
        # Gen4 firmware reads all 8 FSR channels (the Gen3 EAR stub is gone). The
        # channel→zone/side mapping is still unconfirmed against the harness, and one
        # FLOW_LINK side is physically dead on the bench — those read flat 0, which is
        # a hardware state, not "not implemented".
        "fsr_l": fsr_reading(live["fsr_l"]) if live else None,
        "fsr_r": fsr_reading(live["fsr_r"]) if live else None,
    }


def _hardware(frame: dict | None) -> dict:
    """Decode the telemetry actuator bitmask into the Manifold Diagnostic dots."""
    if frame is None or frame.get("actuators") is None:
        return {
            "reported": False,
            "pump": None,
            "pump_duty_pct": None,
            "purge_valve": None,
            "valves": {zone: None for zone in ZONES},
            "note": "no telemetry yet",
        }
    act = int(frame["actuators"])
    return {
        "reported": True,
        "pump": bool(act & 0b1),
        "pump_duty_pct": None,
        "purge_valve": bool(act & 0b10),  # relief valve
        "valves": {zone: bool(act & (0b100 << i)) for i, zone in enumerate(ZONES)},
        "note": None,
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

    # Manifold flatline, gated exactly like the zones: armed only while some zone
    # is commanded, from whichever is later — the flatline or the command.
    any_commanded = any(z["effective_mmhg"] > 0 for z in zones)
    m_flat = runtime.manifold_flat_since
    m_commanded = runtime.note_manifold_commanded(any_commanded)
    if m_flat is not None and m_commanded is not None:
        m_flat = max(m_flat, m_commanded)
    m_fault = manifold_fault(any_commanded, m_flat, now)

    raise_zone_alerts(conn, runtime, zones, m_fault)

    snapshot = {
        "id": runtime.device_id,
        "label": runtime.label,
        "transport": runtime.transport,
        "port": runtime.port,
        "connected": runtime.connected,
        "rate_hz": runtime.rate_hz,
        # None until the firmware gains a device-identity command (POUCH_ID is on
        # the Gen4 known-limitations list) — a board cannot identify itself yet.
        "fw_version": runtime.fw_version,
        "error": runtime.link.error if runtime.link else None,
        "service_mode": runtime.service_mode,
        "session_id": runtime.session_id,
        # Who opened the running session: "app" (this operator) or "console"
        # (the patient console; this app adopted it). The UI shows a "started
        # from the patient console" notice for the latter.
        "session_source": runtime.session_source,
        "session_started_at": runtime.session_started_at,
        # The pouch's own clock is authoritative whenever it is running, so an
        # app-started and a console-started session read identically. Falls back
        # to the app record only before the first running frame arrives.
        "session_elapsed_s": (
            frame.get("device_elapsed_s")
            if frame and frame.get("device_state") in ("PRESSURIZING", "MAINTENANCE")
            else (now - runtime.session_started_at if runtime.session_started_at else None)
        ),
        "patient": patient,
        # Who the pouch is checked out to (mirrored on the patient console) —
        # independent of whether a session is running.
        "checked_out_patient": (
            _patient_summary(conn, runtime.checked_out_patient_id)
            if runtime.checked_out_patient_id is not None
            else None
        ),
        # The checked-out patient's STORED regime per zone (prescribed_mmhg,
        # massage_level, massage_seconds) — what the admin shows and edits at
        # idle. Distinct from zones[] above, which is what the pouch is actually
        # driving right now (0 when idle); mixing them would raise false
        # out-of-band alarms.
        "checked_out_regime": (
            patients_repo.prescriptions_by_zone(conn, runtime.effective_patient_id)
            if runtime.effective_patient_id is not None
            else {}
        ),
        "zones": zones,
        "ceiling_mmhg": ceiling,
        "trim_range_pct": trim_range,
        "alerts": audit.unacked_alerts(conn, runtime.device_id),
        "manifold_mmhg": frame["manifold"] if frame else None,
        "manifold_fault": m_fault,
        # The device's OWN state machine and session clock, straight from
        # telemetry — the source both UIs mirror. A session may be driven from
        # the BLE console too, so the app never assumes it is the only actor.
        "device_state": frame.get("device_state") if frame else None,
        "device_elapsed_s": frame.get("device_elapsed_s") if frame else None,
        # Massage countdown seconds, straight from telemetry — the single synced
        # source both the operator app and the patient console display.
        "vibration_remaining_s": (
            frame.get("vibration_remaining_s") if frame else None
        ),
        # App session says "running" but the device is idle with zero targets:
        # someone stopped it out-of-band (the patient's console STOP).
        "stopped_externally": (
            runtime.session_id is not None
            and frame is not None
            and frame.get("device_state") in ("IDLE", "STOPPED")
            and all(z["target"] == 0 for z in frame["zones"].values())
            and any(z["effective_mmhg"] > 0 for z in zones)
        ),
        # Actuator state, decoded from the telemetry ACT bitmask (bit0 pump,
        # bit1 relief, bit2-5 valves FRONT/TEMPLE/EAR/BACK) — drives the
        # operator app's Manifold Diagnostic dots. None when no frame yet.
        "hardware": _hardware(frame),
        # The pump charges the shared manifold to the highest commanded target
        # before equalising into each pad.
        "manifold_target_mmhg": max((z["effective_mmhg"] for z in zones), default=0),
    }

    if include_technical:
        snapshot["technical"] = {
            "log_tail": runtime.log_tail[-25:],
            "last_responses": runtime.last_responses[-10:],  # tagged OK:/ERR:/R: lines
            "raw_frame": frame,
        }

    return snapshot
