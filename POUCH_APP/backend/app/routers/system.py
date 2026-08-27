"""Health, clinical settings and serial-port discovery."""

from __future__ import annotations

import contextlib
import sqlite3

from fastapi import APIRouter, Depends

from ..core.zones import ZONES
from ..db import get_db
from ..repositories import app_settings, audit
from ..schemas.settings import SerialPortOut, SettingsIn, SettingsOut
from ..transport.registry import registry
from ..transport.serial_link import list_ports

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict:
    return {"ok": True, "zones": list(ZONES)}


@router.get("/settings", response_model=SettingsOut)
def read_settings(db: sqlite3.Connection = Depends(get_db)) -> SettingsOut:
    return app_settings.get(db)


@router.put("/settings", response_model=SettingsOut)
def write_settings(
    body: SettingsIn, db: sqlite3.Connection = Depends(get_db)
) -> SettingsOut:
    before = app_settings.get(db)
    app_settings.update(db, body.model_dump())
    audit.record(db, "update", "settings", before.model_dump(), body.model_dump())
    db.commit()

    # Firmware control variables (tolerance, actuation threshold, telemetry
    # interval, vibration PWM levels) take effect on every connected pouch
    # immediately — not just on next connect. The app-side clamps (ceiling,
    # trim range) never reach the firmware.
    after = app_settings.get(db)
    before_vars = app_settings.firmware_variables(before)
    for name, value in app_settings.firmware_variables(after).items():
        if value != before_vars.get(name):
            for runtime in registry.all():
                if runtime.connected and runtime.link is not None:
                    with contextlib.suppress(Exception):
                        runtime.link.set_variable(name, value)

    return after


@router.get("/serial-ports", response_model=list[SerialPortOut])
def serial_ports() -> list[dict]:
    return list_ports()
