"""Transport abstraction.

A Link ships text lines to and from one pouch; the FOLLI grammar itself lives in
protocol.py and is identical on every transport (serial today, BLE next — the
firmware's NimBLE server carries the same lines — WiFi when the firmware grows it).
Adding a transport means one new file implementing _open/_close/_write/_read_line.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable

from . import protocol
from .protocol import (  # re-exported for existing importers/tests
    ACTUAL_COLUMNS,
    FSR_COLUMNS,
    TARGET_COLUMNS,
    TELEMETRY_FIELDS,
    parse_telemetry,
)

__all__ = [
    "Link", "parse_telemetry", "TELEMETRY_FIELDS",
    "FSR_COLUMNS", "TARGET_COLUMNS", "ACTUAL_COLUMNS",
]


class Link:
    """Base transport. Subclasses implement _open/_close/_write/_read_line."""

    def __init__(self, device_id: str, on_telemetry: Callable[[dict], None],
                 on_log: Callable[[str], None],
                 on_response: Callable[[str, str], None] | None = None):
        self.device_id = device_id
        self._on_telemetry = on_telemetry
        self._on_log = on_log
        self._on_response = on_response or (lambda kind, payload: None)
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.connected = False
        self.error: str | None = None
        self.last_frame_at: float | None = None
        self._frame_times: list[float] = []

    # -- lifecycle ---------------------------------------------------------
    def connect(self) -> None:
        if self.connected:
            return
        self._open()
        self.connected = True
        self.error = None
        self._stop.clear()
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()

    def disconnect(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
        self._close()
        self.connected = False

    # -- telemetry rate ----------------------------------------------------
    @property
    def rate_hz(self) -> float:
        now = time.time()
        recent = [t for t in self._frame_times if now - t < 3]
        return round(len(recent) / 3.0, 1) if recent else 0.0

    def _note_frame(self) -> None:
        now = time.time()
        self.last_frame_at = now
        self._frame_times.append(now)
        if len(self._frame_times) > 100:
            self._frame_times = self._frame_times[-100:]

    def _read_loop(self) -> None:
        while not self._stop.is_set():
            try:
                line = self._read_line()
            except Exception as exc:               # transport died under us
                self.error = str(exc)
                self.connected = False
                return
            if not line:
                continue
            kind, payload = protocol.decode_line(line)
            if kind == protocol.TELEMETRY:
                self._note_frame()
                self._on_telemetry(payload)
            elif kind == protocol.RESPONSE:
                tag, rest = payload
                self._on_response(tag, rest)
            else:
                self._on_log(payload)

    # -- commands ----------------------------------------------------------
    # Thin wrappers over protocol encoders; each returns the wire string sent
    # so callers can audit it.

    def _send(self, cmd: str) -> str:
        self._write(cmd + "\n")
        return cmd

    def set_targets(self, targets: dict[str, int]) -> str:
        """targets maps zone name -> mmHg."""
        return self._send(protocol.encode_set_pressure(targets))

    def start(self) -> str:
        return self._send(protocol.encode_start())

    def stop(self) -> str:
        """Vent every channel and stop vibration — OK:STOP, bench-verified.

        (Gen3 needed 'r' here because its 's' left the pump running; the rewritten
        firmware's stop vents properly, so that workaround is gone.)
        """
        return self._send(protocol.encode_stop())

    def emergency(self) -> str:
        """The new grammar has no separate emergency token; stop IS the full vent."""
        return self._send(protocol.encode_stop())

    def rezero(self) -> str:
        """Vent + re-capture the atmospheric baseline (real 'restart' command now)."""
        return self._send(protocol.encode_restart())

    def reset_all(self) -> str:
        return self._send(protocol.encode_reset_all())

    def set_vibration(self, levels: list[int]) -> str:
        """Positional levels for channels 0..3; -1 leaves a channel unchanged."""
        return self._send(protocol.encode_set_vibration(levels))

    def load_user(self, user_id: int, pressures: list[int]) -> str:
        """Check a known user out to the device (id + full 4-zone regime)."""
        return self._send(protocol.encode_load_user(user_id, pressures))

    def read(self, what: str) -> str:
        return self._send(protocol.encode_read(what))

    # -- subclass hooks ----------------------------------------------------
    def _open(self) -> None: raise NotImplementedError
    def _close(self) -> None: raise NotImplementedError
    def _write(self, data: str) -> None: raise NotImplementedError
    def _read_line(self) -> str: raise NotImplementedError
