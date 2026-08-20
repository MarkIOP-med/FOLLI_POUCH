"""Turning zone state into durable alerts."""

from __future__ import annotations

import sqlite3
import time

from ..repositories import audit
from ..transport.registry import DeviceRuntime

#: Zone status → alert severity. Anything absent here is not alert-worthy.
ALERTING_STATUSES: dict[str, audit.Severity] = {
    "OUT_OF_BAND": "warn",
    "SENSOR_FAULT": "alarm",
}


def raise_zone_alerts(
    conn: sqlite3.Connection, runtime: DeviceRuntime, zones: list[dict],
    manifold_fault: bool = False,
) -> None:
    """Write an event when a zone *enters* a bad state.

    Fires on the transition, not on every frame — the snapshot is built at 5 Hz and
    a per-frame insert would put ~18k rows an hour into the events table and make
    the alert strip useless. Clearing back to OK re-arms the zone.
    """
    changed = False

    for zone in zones:
        name, status = zone["zone"], zone["status"]
        if runtime.alerted.get(name) == status:
            continue

        severity = ALERTING_STATUSES.get(status)
        if severity is not None:
            detail = (
                f"{name} sensor flat at 0 -- suspect open circuit"
                if status == "SENSOR_FAULT"
                else f"{name} actual {zone['actual_mmhg']} mmHg vs effective "
                f"{zone['effective_mmhg']} mmHg"
            )
            audit.log_event(
                conn, runtime.device_id, severity, status.lower(), detail,
                runtime.session_id,
            )
            changed = True

        runtime.alerted[name] = status

    # The caller passes the gated verdict (core.pressure.manifold_fault) so this
    # and the snapshot can never disagree. Fires on the transition into fault and
    # re-arms when the fault clears — a one-shot flag that never resets would
    # silence every future genuine failure after the first.
    if manifold_fault and not runtime.manifold_alerted:
        audit.log_event(
            conn,
            runtime.device_id,
            "warn",
            "manifold_fault",
            "Manifold sensor flat at 0 while commanded -- suspect open circuit",
            runtime.session_id,
        )
        runtime.manifold_alerted = True
        changed = True
    elif not manifold_fault:
        runtime.manifold_alerted = False

    if changed:
        conn.commit()


def touch(runtime: DeviceRuntime) -> float:
    """Current time, isolated so tests can freeze it."""
    _ = runtime
    return time.time()
