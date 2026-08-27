"""Device registry, live stream, control commands and sessions."""

from __future__ import annotations

import asyncio
import contextlib
import json
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

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
    VibrateIn,
    VibrationIn,
    ZoneRxIn,
)
from ..services import snapshot as snapshot_service
from ..transport.registry import DeviceRuntime, registry
from .dependencies import get_connected_runtime, get_runtime, validate_zone

router = APIRouter(prefix="/devices", tags=["devices"])


def _push_user_regime(
    db: sqlite3.Connection, runtime: DeviceRuntime, patient_id: int
) -> None:
    """Send the patient's prescribed regime to the firmware's user record.

    Best-effort: a failed push must not block the session — the app still
    drives targets explicitly via apply; only the console's `start` depends on
    the device-side record.
    """
    patient = patients_repo.get(db, patient_id)
    if patient is None:
        return
    prescriptions = patient["prescriptions"]
    rx = {p["zone"]: p["prescribed_mmhg"] for p in prescriptions}
    pressures = [int(rx.get(z, 0)) for z in ZONES]
    # The massage duration is per-patient (massage_seconds). Push it as the
    # firmware's vibration duration so this user's countdown runs the right
    # length; both apps then show the same countdown from telemetry.
    seconds = max(
        (int(p.get("massage_seconds") or 0) for p in prescriptions), default=0
    ) or 30
    with contextlib.suppress(Exception):
        assert runtime.link is not None
        sent = runtime.link.load_user(patient_id, pressures, patient["full_name"])
        runtime.link.set_variable("VIBRATION_DURATION", seconds * 1000)
        audit.log_event(
            db, runtime.device_id, "info", "push_user_regime", sent, runtime.session_id
        )


def send_or_502(action) -> str:
    """Run one link command; a transport that died since the dependency check
    (unplugged cable, reader thread flipping connected=False) becomes a clean
    502 instead of an unhandled RuntimeError → 500."""
    try:
        return action()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"device link failed: {exc}"
        ) from exc


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
    # A page load may precede the SSE stream — adopt a console-driven session
    # here too so the very first snapshot is already correct.
    _reconcile_session(runtime, db)
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
    # The board's user record is RAM-only: a reconnect may follow a power-cycle
    # that wiped it, so re-assert who this pouch is checked out to. With nobody
    # selected, default to NO_USER — the app and the board then agree on the same
    # factory profile the console runs standalone.
    if runtime.checked_out_patient_id is None:
        runtime.checked_out_patient_id = patients_repo.default_patient_id(db)
    if runtime.checked_out_patient_id is not None:
        _push_user_regime(db, runtime, runtime.checked_out_patient_id)
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
# SSE rather than polling: telemetry lands at 5 Hz (200ms firmware cadence) and
# is coalesced here — the UI cannot use more, and the DB write is downsampled
# separately.

@router.get("/{device_id}/stream")
async def stream_device(runtime: DeviceRuntime = Depends(get_runtime)) -> StreamingResponse:
    async def generate():
        last_write = 0.0
        # One connection for the stream's lifetime (this used to open ~5/sec),
        # and any build error ends the stream cleanly — EventSource reconnects.
        try:
            with session_scope() as conn:
                while True:
                    # Adopt/close a console-driven session before building, so
                    # the streamed snapshot already reflects it.
                    _reconcile_session(runtime, conn)
                    payload = snapshot_service.build(runtime, conn, include_technical=True)
                    yield f"data: {json.dumps(payload)}\n\n"

                    # Bind the frame once: the reader thread reassigns last_frame
                    # concurrently, and reading it field-by-field can tear one DB
                    # row across two different frames.
                    frame = runtime.last_frame
                    now = time.time()
                    if (
                        runtime.session_id
                        and frame
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
                                    frame["zones"][zone]["target"],
                                    frame["zones"][zone]["actual"],
                                    frame["manifold"],
                                )
                                for zone in ZONES
                            ],
                        )
                        conn.commit()

                    await asyncio.sleep(settings.stream_interval_s)
        except Exception:
            return

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
    sent = send_or_502(lambda: runtime.link.set_targets(targets))

    audit.log_event(db, runtime.device_id, "info", "apply", sent, runtime.session_id)
    audit.record(db, "apply", f"device:{runtime.device_id}", None, targets)
    db.commit()
    return {"sent": sent, "targets": targets}


@router.post("/{device_id}/stop", response_model=CommandResult)
def stop_device(
    runtime: DeviceRuntime = Depends(get_connected_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> CommandResult:
    """STOP ALL — the firmware's `stop` vents every channel and halts vibration."""
    assert runtime.link is not None
    sent = send_or_502(runtime.link.stop)
    audit.log_event(db, runtime.device_id, "warn", "stop", f"sent {sent!r}", runtime.session_id)
    db.commit()
    return CommandResult(sent=sent)


@router.post("/{device_id}/emergency", response_model=CommandResult)
def emergency_device(
    runtime: DeviceRuntime = Depends(get_connected_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> CommandResult:
    assert runtime.link is not None
    sent = send_or_502(runtime.link.emergency)
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

    The firmware has no true pause — venting (`stop`) while the app retains the
    session is the only honest implementation. START/APPLY resumes.
    """
    assert runtime.link is not None
    sent = send_or_502(runtime.link.emergency)
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
    sent = send_or_502(runtime.link.rezero)
    audit.log_event(db, runtime.device_id, "info", "rezero", sent, runtime.session_id)
    db.commit()
    return CommandResult(
        sent=sent, note="vented and re-captured the atmospheric reference"
    )


@router.post("/{device_id}/restart", response_model=CommandResult)
def restart_device(
    runtime: DeviceRuntime = Depends(get_connected_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> CommandResult:
    """Recover a stuck pouch: vent and re-initialise the control loop. Keeps the
    session, the patient, and the regime — it just un-sticks the pressure loop."""
    assert runtime.link is not None
    sent = send_or_502(runtime.link.restart)
    audit.log_event(db, runtime.device_id, "warn", "restart", sent, runtime.session_id)
    db.commit()
    return CommandResult(sent=sent, note="pouch restarted (control loop re-initialised)")


@router.post("/{device_id}/factory-reset", response_model=CommandResult)
def factory_reset_device(
    runtime: DeviceRuntime = Depends(get_connected_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> CommandResult:
    """Restore the pouch to factory state: vent + reset the board to NO_USER, delete
    every patient except NO_USER, and reset NO_USER's own regime to the shipped
    default. Does NOT touch the clinical settings (ceiling, trim range, etc.)."""
    assert runtime.link is not None

    # End any running session first so no stale session record survives the wipe.
    if runtime.session_id is not None:
        repo.end_session(db, runtime.session_id, "factory_reset")
        runtime.end_session()

    removed = patients_repo.delete_all_except_default(db)
    patients_repo.reset_default_regime(db)

    # Reset the board itself (firmware resetall → vented, IDLE, checked out to
    # NO_USER), then check NO_USER back out from this side so both agree.
    sent = send_or_502(runtime.link.reset_all)
    runtime.checked_out_patient_id = patients_repo.default_patient_id(db)
    if runtime.checked_out_patient_id is not None:
        _push_user_regime(db, runtime, runtime.checked_out_patient_id)

    audit.record(
        db, "factory_reset", f"device:{runtime.device_id}",
        {"patients_removed": removed}, None,
    )
    audit.log_event(
        db, runtime.device_id, "warn", "factory_reset",
        f"removed {removed} patients; reset to NO_USER", None,
    )
    db.commit()
    return CommandResult(
        sent=sent, note=f"factory reset — {removed} patients removed, board on NO_USER"
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
    patient_id = runtime.effective_patient_id
    if runtime.service_mode or patient_id is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "no patient loaded; use the setpoint endpoint"
        )

    ceiling = app_settings.get(db).max_pressure_mmhg
    mmhg = int(clamp(body.mmhg, 0, ceiling))
    before = patients_repo.set_zone_pressure(db, patient_id, zone, mmhg)

    audit.record(
        db,
        "set_rx",
        f"patient:{patient_id}:{zone}",
        {"prescribed_mmhg": before},
        {"prescribed_mmhg": mmhg},
    )
    db.commit()

    # Keep the device-side user record current, so a console START after this
    # edit applies the edited regime, not a stale copy.
    if runtime.connected and runtime.link is not None:
        _push_user_regime(db, runtime, patient_id)
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
    patient_id = runtime.effective_patient_id
    if patient_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "no patient loaded")
    zone = validate_zone(body.zone)

    trim_range = app_settings.get(db).trim_range_pct
    trim = int(clamp(body.trim_pct, -trim_range, trim_range))
    patients_repo.set_trim(db, patient_id, zone, trim)

    audit.record(
        db, "trim", f"patient:{patient_id}:{zone}", None, {"trim_pct": trim}
    )
    db.commit()
    return snapshot_service.build(runtime, db)


@router.post("/{device_id}/vibrate", response_model=CommandResult)
def vibrate_zone(
    body: VibrateIn,
    runtime: DeviceRuntime = Depends(get_connected_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> CommandResult:
    """Run one zone's vibration motor NOW, at the given level.

    Deliberately transient: nothing is stored, and vibration is never started
    implicitly (START does not buzz — an operator triggers it per zone, as many
    times as the client wants). The firmware auto-stops the motor after its
    VIBRATION_DURATION_MS (20s default); re-triggering restarts the window.
    Other zones are sent -1 ("leave unchanged"), so zones run simultaneously —
    triggering one never stops another mid-run.
    """
    zone = validate_zone(body.zone)
    assert runtime.link is not None
    vector = [body.level if z == zone else -1 for z in ZONES]
    sent = send_or_502(lambda: runtime.link.set_vibration(vector))
    audit.log_event(
        db, runtime.device_id, "info", "vibrate", f"{zone} level {body.level}",
        runtime.session_id,
    )
    db.commit()
    return CommandResult(sent=sent)


@router.put("/{device_id}/vibration")
def set_vibration(
    body: VibrationIn,
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    patient_id = runtime.effective_patient_id
    if patient_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "no patient loaded")
    zone = validate_zone(body.zone)

    # Store first but commit only after the device push: committing before a
    # failed push would leave the record claiming a level the device never got.
    patients_repo.set_vibration(
        db, patient_id, zone, body.massage_level, body.massage_seconds
    )
    audit.record(
        db, "set_vibration", f"patient:{patient_id}:{zone}", None,
        body.model_dump(),
    )

    payload = snapshot_service.build(runtime, db)

    # Push to the device too — the firmware's setvibration is positional and
    # full-vector only, so send every zone's stored level, not just the edited one.
    # Read levels from the edited patient's own record (works at idle, where the
    # commanded zones[] would read 0).
    if runtime.connected and runtime.link is not None:
        rx = patients_repo.prescriptions_by_zone(db, patient_id)
        sent = send_or_502(
            lambda: runtime.link.set_vibration(
                [rx.get(z, {}).get("massage_level", 0) for z in ZONES]
            )
        )
        audit.log_event(
            db, runtime.device_id, "info", "set_vibration", sent, runtime.session_id
        )

    db.commit()
    return payload


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


# ── patient checkout ────────────────────────────────────────────────────────
# Selecting a patient in the operator app checks them out to the POUCH at that
# moment — before any session — so the patient console, which mirrors the
# board's user record, shows the same person the operator sees. The two UIs
# complement each other instead of each holding a private idea of who is there.

class CheckoutPatientIn(BaseModel):
    patient_id: int | None


@router.put("/{device_id}/patient")
def checkout_patient(
    body: CheckoutPatientIn,
    runtime: DeviceRuntime = Depends(get_runtime),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    if body.patient_id is not None and patients_repo.get(db, body.patient_id) is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"no such patient: {body.patient_id}"
        )
    runtime.checked_out_patient_id = body.patient_id
    # The firmware has no "unassign" short of RESET ALL (which pressurizes), so
    # clearing only forgets on this side; the next checkout overwrites the board.
    if body.patient_id is not None and runtime.connected and runtime.link is not None:
        _push_user_regime(db, runtime, body.patient_id)
    audit.record(
        db, "checkout_patient", f"device:{runtime.device_id}", None,
        {"patient_id": body.patient_id},
    )
    db.commit()
    return snapshot_service.build(runtime, db)


# ── device-driven session adoption ──────────────────────────────────────────
# The pouch runs its OWN session state machine, and the patient console can
# start it over BLE without this app involved. When that happens the operator
# app must still (a) show the live session and (b) record its telemetry — a
# treatment with no clinical record is worse than an invisible one. So the app
# ADOPTS a device-started session: it opens a session row against the checked-
# out patient the instant the pouch starts running unbidden, and closes it when
# the pouch goes idle. An operator-started ("app") session is never auto-closed
# — the operator ends it explicitly.

_DEVICE_RUNNING_STATES = ("PRESSURIZING", "MAINTENANCE")
_DEVICE_IDLE_STATES = ("IDLE", "STOPPED")


def _reconcile_session(runtime: DeviceRuntime, db: sqlite3.Connection) -> None:
    """Open or close an adopted session so the app's session record tracks the
    pouch's own run, whoever started it. Idempotent: acts only on transitions."""
    frame = runtime.last_frame
    device_state = frame.get("device_state") if frame else None

    if device_state in _DEVICE_RUNNING_STATES and runtime.session_id is None:
        patient_id = runtime.checked_out_patient_id
        session_id = repo.start_session(db, runtime.device_id, patient_id)
        runtime.begin_session(session_id, patient_id, source="console")
        # Anchor the app clock to the pouch's own elapsed, so an adopted session
        # reads the same time as the console that started it — not time-since-
        # this-app-happened-to-notice.
        runtime.session_started_at = time.time() - (frame.get("device_elapsed_s") or 0)
        audit.log_event(
            db, runtime.device_id, "info", "session_adopt",
            f"patient={patient_id}", session_id,
        )
        db.commit()
    elif (
        device_state in _DEVICE_IDLE_STATES
        and runtime.session_id is not None
        and runtime.session_source == "console"
    ):
        session_id = runtime.session_id
        repo.end_session(db, session_id, "console")
        audit.log_event(db, runtime.device_id, "info", "session_end_console", "", session_id)
        runtime.end_session()
        db.commit()


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

    # Starting with a patient also checks them out to the DEVICE (user:<id>:
    # <regime>:<name>) — normally already done at selection time, but START is
    # the moment the regime must be right, so it is asserted again here.
    if body.patient_id is not None:
        runtime.checked_out_patient_id = body.patient_id
        if runtime.connected and runtime.link is not None:
            _push_user_regime(db, runtime, body.patient_id)

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
