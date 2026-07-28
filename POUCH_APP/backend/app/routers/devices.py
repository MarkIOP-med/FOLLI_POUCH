"""Device registry, live stream, control commands and sessions."""

from __future__ import annotations

import asyncio
import contextlib
import json
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from ..config import settings
from ..core.pressure import clamp
from ..core.zones import ZONES
from ..db import get_db
from ..db.session import session_scope
from ..repositories import app_settings, audit
from ..repositories import devices as repo
from ..repositories import patients as patients_repo
from ..schemas.device import (
    CommandResult,
    DeviceIn,
    SetpointIn,
    StartSessionIn,
    TrimIn,
    VibrationIn,
    ZoneRxIn,
)
from ..services import snapshot as snapshot_service
from ..transport.registry import DeviceRuntime, registry
from .dependencies import get_connected_runtime, get_runtime, validate_zone

router = APIRouter(prefix="/devices", tags=["devices"])


# ── registry ────────────────────────────────────────────────────────────────

@router.get("")
def list_devices(db: sqlite3.Connection = Depends(get_db)) -> list[dict]:
    return [snapshot_service.build(rt, db) for rt in registry.all()]


@router.post("", status_code=status.HTTP_201_CREATED)
def add_device(body: DeviceIn, db: sqlite3.Connection = Depends(get_db)) -> dict:
    if repo.exists(db, body.id):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"device {body.id} already exists"
        )
    if body.transport == "serial" and not body.port:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "a serial device needs a port"
        )

    repo.create(db, body.id, body.label, body.transport, body.port)
    audit.record(db, "create", f"device:{body.id}", None, body.model_dump())
    db.commit()

    runtime = registry.add(body.id, body.label, body.transport, body.port)
    return snapshot_service.build(runtime, db)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_device(
    device_id: str,
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> None:
    _ = runtime
    repo.delete(db, device_id)
    audit.record(db, "delete", f"device:{device_id}")
    db.commit()
    registry.remove(device_id)


@router.get("/{device_id}")
def get_device(
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    return snapshot_service.build(runtime, db, include_technical=True)


@router.post("/{device_id}/connect")
def connect_device(
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    try:
        runtime.connect()
    except Exception as exc:  # transport failures are expected and reportable
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"could not open {runtime.port or runtime.transport}: {exc}",
        ) from exc

    repo.touch_last_seen(db, runtime.device_id)
    audit.log_event(
        db, runtime.device_id, "info", "connected", runtime.port or runtime.transport
    )
    db.commit()
    return snapshot_service.build(runtime, db)


@router.delete("/{device_id}/connect")
def disconnect_device(
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    runtime.disconnect()
    return snapshot_service.build(runtime, db)


# ── live stream ─────────────────────────────────────────────────────────────
# SSE rather than polling: telemetry lands at ~12 Hz, which a poll loop cannot
# track. Coalesced here — the UI cannot use more, and the DB write is downsampled
# separately.

@router.get("/{device_id}/stream")
async def stream_device(runtime: DeviceRuntime = Depends(get_runtime)) -> StreamingResponse:
    async def generate():
        last_write = 0.0
        while True:
            with session_scope() as conn:
                payload = snapshot_service.build(runtime, conn, include_technical=True)
                yield f"data: {json.dumps(payload)}\n\n"

                now = time.time()
                if (
                    runtime.session_id
                    and runtime.last_frame
                    and now - last_write >= settings.telemetry_write_interval_s
                ):
                    last_write = now
                    repo.write_telemetry(
                        conn,
                        runtime.session_id,
                        now,
                        [
                            (
                                zone,
                                runtime.last_frame["zones"][zone]["target"],
                                runtime.last_frame["zones"][zone]["actual"],
                                runtime.last_frame["manifold"],
                            )
                            for zone in ZONES
                        ],
                    )
                    conn.commit()

            await asyncio.sleep(settings.stream_interval_s)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── control ─────────────────────────────────────────────────────────────────

@router.post("/{device_id}/apply")
def apply_targets(
    runtime: DeviceRuntime = Depends(get_connected_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    payload = snapshot_service.build(runtime, db)
    targets = {zone["zone"]: zone["effective_mmhg"] for zone in payload["zones"]}

    assert runtime.link is not None
    sent = runtime.link.set_targets(targets)

    audit.log_event(db, runtime.device_id, "info", "apply", sent, runtime.session_id)
    audit.record(db, "apply", f"device:{runtime.device_id}", None, targets)
    db.commit()
    return {"sent": sent, "targets": targets}


@router.post("/{device_id}/stop", response_model=CommandResult)
def stop_device(
    runtime: DeviceRuntime = Depends(get_connected_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> CommandResult:
    """STOP ALL.

    Sends 'r', not 's'. See transport/base.py — 's' does not turn the pump off.
    """
    assert runtime.link is not None
    sent = runtime.link.stop()
    audit.log_event(db, runtime.device_id, "warn", "stop", f"sent {sent!r}", runtime.session_id)
    db.commit()
    return CommandResult(sent=sent)


@router.post("/{device_id}/emergency", response_model=CommandResult)
def emergency_device(
    runtime: DeviceRuntime = Depends(get_connected_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> CommandResult:
    assert runtime.link is not None
    sent = runtime.link.emergency()
    audit.log_event(
        db, runtime.device_id, "alarm", "emergency_relief", f"sent {sent!r}",
        runtime.session_id,
    )
    db.commit()
    return CommandResult(sent=sent)


@router.post("/{device_id}/pause", response_model=CommandResult)
def pause_device(
    runtime: DeviceRuntime = Depends(get_connected_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> CommandResult:
    """Hold: vent the pads but keep the session and prescriptions loaded.

    The firmware has no true pause. 's' freezes the state machine without turning
    the pump off, so it cannot be used here — venting and keeping the session is the
    only honest implementation. START/APPLY resumes.
    """
    assert runtime.link is not None
    sent = runtime.link.emergency()
    audit.log_event(
        db, runtime.device_id, "info", "pause",
        f"vented, session held (sent {sent!r})", runtime.session_id,
    )
    db.commit()
    return CommandResult(
        sent=sent, note="vented; session and prescriptions retained"
    )


@router.post("/{device_id}/rezero", response_model=CommandResult)
def rezero_device(
    runtime: DeviceRuntime = Depends(get_connected_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> CommandResult:
    assert runtime.link is not None
    sent = runtime.link.rezero()
    audit.log_event(db, runtime.device_id, "info", "rezero", sent, runtime.session_id)
    db.commit()
    return CommandResult(
        sent=sent, note="firmware has no re-zero command yet; vented instead"
    )


@router.put("/{device_id}/setpoint")
def set_setpoint(
    body: SetpointIn,
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    """Service-mode direct pressure entry. Clamped to the configured ceiling."""
    if not runtime.service_mode:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "device is not in service mode; edit the prescription",
        )
    zone = validate_zone(body.zone)
    ceiling = app_settings.get(db).max_pressure_mmhg
    runtime.setpoints[zone] = int(clamp(body.mmhg, 0, ceiling))
    return snapshot_service.build(runtime, db)


@router.put("/{device_id}/zones/{zone}")
def set_zone_rx(
    body: ZoneRxIn,
    zone: str = Depends(validate_zone),
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    """Edit the prescription from the device screen (the mock's editable Target box).

    Writes prescribed_mmhg only. patient_trim_pct is untouched — the trim belongs to
    the patient and is never overwritten by a clinician edit.
    """
    if runtime.service_mode or runtime.patient_id is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "no patient loaded; use the setpoint endpoint"
        )

    ceiling = app_settings.get(db).max_pressure_mmhg
    mmhg = int(clamp(body.mmhg, 0, ceiling))
    before = patients_repo.set_zone_pressure(db, runtime.patient_id, zone, mmhg)

    audit.record(
        db,
        "set_rx",
        f"patient:{runtime.patient_id}:{zone}",
        {"prescribed_mmhg": before},
        {"prescribed_mmhg": mmhg},
    )
    db.commit()
    return snapshot_service.build(runtime, db)


@router.put("/{device_id}/trim")
def set_trim(
    body: TrimIn,
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    """Patient trim. Normally arrives from the console via the pouch.

    Written to patient_trim_pct only — NEVER folded into prescribed_mmhg, which
    would compound across sessions and walk past the ceiling.
    """
    if runtime.patient_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "no patient loaded")
    zone = validate_zone(body.zone)

    trim_range = app_settings.get(db).trim_range_pct
    trim = int(clamp(body.trim_pct, -trim_range, trim_range))
    patients_repo.set_trim(db, runtime.patient_id, zone, trim)

    audit.record(
        db, "trim", f"patient:{runtime.patient_id}:{zone}", None, {"trim_pct": trim}
    )
    db.commit()
    return snapshot_service.build(runtime, db)


@router.put("/{device_id}/vibration")
def set_vibration(
    body: VibrationIn,
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    if runtime.patient_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "no patient loaded")
    zone = validate_zone(body.zone)

    patients_repo.set_vibration(
        db, runtime.patient_id, zone, body.massage_level, body.massage_seconds
    )
    audit.record(
        db, "set_vibration", f"patient:{runtime.patient_id}:{zone}", None,
        body.model_dump(),
    )
    db.commit()
    return snapshot_service.build(runtime, db)


@router.post("/{device_id}/alerts/{event_id}/ack")
def ack_alert(
    event_id: int,
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    audit.ack(db, runtime.device_id, event_id)
    db.commit()
    return {"ok": True}


# ── admin ───────────────────────────────────────────────────────────────────

@router.post("/{device_id}/admin/reset-defaults")
def reset_defaults(
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    """Reset every zone to 0 mmHg and clear the patient's trim."""
    if runtime.patient_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "no patient loaded")

    patients_repo.reset_all(db, runtime.patient_id)
    audit.record(db, "reset_defaults", f"patient:{runtime.patient_id}")
    audit.log_event(
        db, runtime.device_id, "warn", "reset_defaults", "all zones reset to 0",
        runtime.session_id,
    )
    db.commit()
    return snapshot_service.build(runtime, db)


@router.post("/{device_id}/admin/set-current-default")
def set_current_as_default(
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    """Promote the current effective pressures to the prescription, clearing the trim.

    This CONSUMES the trim rather than stacking on top of it: new prescribed becomes
    the effective value and patient_trim_pct resets to 0. Doing it repeatedly is how
    a prescription ratchets upward (40 -> 44 -> 48.4 ...), so it is an explicit,
    audited clinician action, never something that happens automatically.
    """
    if runtime.patient_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "no patient loaded")

    payload = snapshot_service.build(runtime, db)
    before = {z["zone"]: z["prescribed_mmhg"] for z in payload["zones"]}
    after = {z["zone"]: z["effective_mmhg"] for z in payload["zones"]}

    for zone_name, effective in after.items():
        patients_repo.promote_effective(db, runtime.patient_id, zone_name, effective)

    audit.record(
        db, "set_current_as_default", f"patient:{runtime.patient_id}", before, after
    )
    audit.log_event(
        db, runtime.device_id, "warn", "set_current_as_default",
        f"{before} -> {after} (trim consumed)", runtime.session_id,
    )
    db.commit()
    return snapshot_service.build(runtime, db)


# ── sessions ────────────────────────────────────────────────────────────────

@router.post("/{device_id}/session")
def start_session(
    body: StartSessionIn,
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    if runtime.session_id is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "a session is already running on this pouch"
        )
    if body.patient_id is not None and patients_repo.get(db, body.patient_id) is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"no such patient: {body.patient_id}"
        )

    session_id = repo.start_session(db, runtime.device_id, body.patient_id)
    runtime.begin_session(session_id, body.patient_id)

    audit.log_event(
        db,
        runtime.device_id,
        "info",
        "session_start_service" if runtime.service_mode else "session_start",
        f"patient={body.patient_id}",
        session_id,
    )
    audit.record(
        db, "start_session", f"device:{runtime.device_id}", None,
        {"patient_id": body.patient_id},
    )
    db.commit()
    return snapshot_service.build(runtime, db)


@router.delete("/{device_id}/session")
def end_session(
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    if runtime.session_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "no session running")

    # Vent before releasing. Ending a session must never leave a pad inflated.
    # A dead link must not block the session record from closing, hence suppress.
    if runtime.connected and runtime.link is not None:
        with contextlib.suppress(Exception):
            runtime.link.emergency()

    session_id = runtime.session_id
    repo.end_session(db, session_id, settings.default_actor)
    audit.log_event(db, runtime.device_id, "info", "session_end", "", session_id)
    audit.record(
        db, "end_session", f"device:{runtime.device_id}", {"session_id": session_id}, None
    )
    db.commit()

    runtime.end_session()
    return snapshot_service.build(runtime, db)
