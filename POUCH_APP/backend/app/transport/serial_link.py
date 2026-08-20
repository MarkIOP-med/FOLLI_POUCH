"""USB serial transport (pyserial)."""

from __future__ import annotations

import contextlib

import serial
import serial.tools.list_ports

from .base import Link

BAUD = 9600

# The retired Arduino Due bench board had a footgun: opening its programming port at
# 1200 baud is the bootloader erase trigger and wipes flash. The current ESP32 board
# has no such trap, but the guard is free and the Due may reappear — baud stays
# non-configurable by design.
FORBIDDEN_BAUD = 1200

# The current pouch (ESP32 devkit) enumerates through a CP2102 USB-UART bridge.
CP2102_VID_PID = "10C4:EA60"


def list_ports() -> list[dict]:
    out = []
    for p in serial.tools.list_ports.comports():
        out.append({
            "port": p.device,
            "description": p.description,
            "hwid": p.hwid,
            # CP2102 bridge == almost certainly the pouch on this bench
            "likely_pouch": CP2102_VID_PID in (p.hwid or ""),
        })
    return out


class SerialLink(Link):
    """One pouch on one COM port.

    Opening the port toggles DTR, which RESETS the ESP32: expect ~7s of boot
    (startup vent + reference capture) before commands are honored. The boot
    banners ("Venting system to atmosphere...", "Ready. No pressure applied.")
    arrive through the log callback.
    """

    def __init__(self, device_id, port, on_telemetry, on_log, on_response=None):
        super().__init__(device_id, on_telemetry, on_log, on_response)
        self.port = port
        self._ser: serial.Serial | None = None

    def _open(self) -> None:
        if BAUD == FORBIDDEN_BAUD:
            raise RuntimeError("1200 baud erases the Due bootloader; refusing to open")
        self._ser = serial.Serial(self.port, BAUD, timeout=1)

    def _close(self) -> None:
        # Closing a port that is already gone (device unplugged) must not raise.
        if self._ser and self._ser.is_open:
            with contextlib.suppress(Exception):
                self._ser.close()
        self._ser = None

    def _write(self, data: str) -> None:
        if not self._ser or not self._ser.is_open:
            raise RuntimeError(f"{self.device_id}: port not open")
        self._ser.write(data.encode())
        self._ser.flush()

    def _read_line(self) -> str:
        if not self._ser:
            return ""
        raw = self._ser.readline()
        if not raw:
            return ""
        return raw.decode("utf-8", errors="replace").strip()
