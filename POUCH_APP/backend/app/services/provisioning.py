"""First-run device provisioning.

The seeded mock pouch was removed, so a fresh install starts with an empty
roster. On a bench that leaves the operator app with nothing to drive — and the
only place to add a device by hand is the Admin screen, which itself needs a
device to be reachable. So on startup, when the roster is empty, auto-register
any pouch the machine can already see on a serial port (the CP2102 bridge the
ESP32 enumerates through, flagged ``likely_pouch`` by ``list_ports``).

Registered *disconnected*: opening the port toggles DTR and resets the ESP32
(~7s boot), so connecting stays a deliberate operator action — ENTER on the home
screen. And only when the roster is empty, so this never overrides an operator's
roster or silently re-adds a device they removed on purpose.
"""

from __future__ import annotations

import sqlite3

from ..repositories import devices as devices_repo
from ..transport.registry import registry
from ..transport.serial_link import list_ports


def provision_detected_pouches(conn: sqlite3.Connection) -> list[str]:
    """Register detected pouches when the roster is empty. Returns the new ids.

    No-op once any device exists. Each detected ``likely_pouch`` port becomes a
    serial device keyed by the port itself (e.g. ``COM6``) — stable across
    restarts and legible in the UI.
    """
    if devices_repo.list_all(conn):
        return []

    added: list[str] = []
    for port in list_ports():
        if not port.get("likely_pouch"):
            continue
        device_id = port["port"]
        if devices_repo.exists(conn, device_id):
            continue
        devices_repo.create(conn, device_id, device_id, "serial", device_id)
        registry.add(device_id, device_id, "serial", device_id)
        added.append(device_id)

    if added:
        conn.commit()
    return added
