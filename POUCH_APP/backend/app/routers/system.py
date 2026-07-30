"""Health, clinical settings and serial-port discovery."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from ..core.zones import ZONES
from ..db import get_db
from ..repositories import app_settings, audit
from ..schemas.settings import SerialPortOut, SettingsIn, SettingsOut
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
    return app_settings.get(db)


@router.get("/serial-ports", response_model=list[SerialPortOut])
def serial_ports() -> list[dict]:
    return list_ports()
