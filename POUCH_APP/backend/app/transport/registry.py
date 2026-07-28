"""Device registry — the multi-pouch change.

The original app.py held a single global SerialManager. The board-roster
architecture needs N pouches addressable by id, which is what this provides.
Every route hangs off it.
"""

from __future__ import annotations

import sqlite3
import threading
import time

from ..core.zones import ZONES
from .base import Link
from .mock_link import MockLink
from .serial_link import SerialLink

#: A pressure reading pinned at exactly 0 for this long is treated as a dead sensor
#: rather than "at atmosphere" — p[i] = max(0.0f, ...) in firmware clamps negatives,
#: so a hard 0 is ambiguous.
_FLATLINE_SAMPLES_ZERO = 0


class DeviceRuntime:
    """Live state for one pouch. Not persisted — the DB holds the durable records."""

    def __init__(self, device_id: str, label: str, transport: str, port: str | None):
        self.device_id = device_id
        self.label = label
        self.transport = transport
        self.port = port

        self.link: Link | None = None
        self.last_frame: dict | None = None
        self.log_tail: list[str] = []
        self.fw_version: str | None = None

        # session state
        self.session_id: int | None = None
        self.patient_id: int | None = None
        self.service_mode: bool = False
        self.session_started_at: float | None = None
        self.setpoints: dict[str, int] = {zone: 0 for zone in ZONES}

        # fault tracking
        self._flat_since: dict[str, float | None] = {zone: None for zone in ZONES}
        self._last_actual: dict[str, int | None] = {zone: None for zone in ZONES}
        self._out_of_band_since: dict[str, float | None] = {zone: None for zone in ZONES}
        self.manifold_flat_since: float | None = None
        self._last_manifold: int | None = None

        # Alerts fire on the transition into a bad state, not on every snapshot.
        self.alerted: dict[str, str] = {}
        self.manifold_alerted: bool = False

    # ── link lifecycle ──────────────────────────────────────────────────────

    def connect(self) -> None:
        if self.link and self.link.connected:
            return

        if self.transport == "mock":
            self.link = MockLink(self.device_id, self._on_telemetry, self._on_log)
        else:
            if not self.port:
                raise ValueError(f"{self.device_id} has no serial port configured")
            self.link = SerialLink(
                self.device_id, self.port, self._on_telemetry, self._on_log
            )

        self.link.connect()

    def disconnect(self) -> None:
        if self.link:
            self.link.disconnect()
        self.link = None
        self.last_frame = None

    @property
    def connected(self) -> bool:
        return bool(self.link and self.link.connected)

    @property
    def rate_hz(self) -> float:
        return self.link.rate_hz if self.link else 0.0

    # ── session lifecycle ───────────────────────────────────────────────────

    def begin_session(self, session_id: int, patient_id: int | None) -> None:
        self.session_id = session_id
        self.patient_id = patient_id
        self.service_mode = patient_id is None
        self.session_started_at = time.time()
        self.setpoints = {zone: 0 for zone in ZONES}

    def end_session(self) -> None:
        self.session_id = None
        self.patient_id = None
        self.service_mode = False
        self.session_started_at = None

    # ── telemetry callbacks ─────────────────────────────────────────────────

    def _on_telemetry(self, frame: dict) -> None:
        now = time.time()

        for zone in ZONES:
            actual = frame["zones"][zone]["actual"]
            previous = self._last_actual[zone]

            if previous == actual == _FLATLINE_SAMPLES_ZERO:
                if self._flat_since[zone] is None:
                    self._flat_since[zone] = now
            elif actual != previous:
                self._flat_since[zone] = None

            self._last_actual[zone] = actual

        manifold = frame["manifold"]
        if self._last_manifold == manifold == _FLATLINE_SAMPLES_ZERO:
            if self.manifold_flat_since is None:
                self.manifold_flat_since = now
        elif manifold != self._last_manifold:
            self.manifold_flat_since = None
        self._last_manifold = manifold

        self.last_frame = frame

    def _on_log(self, line: str) -> None:
        self.log_tail.append(line)
        if len(self.log_tail) > 60:
            self.log_tail = self.log_tail[-60:]

    # ── fault helpers ───────────────────────────────────────────────────────

    def flat_since(self, zone: str) -> float | None:
        return self._flat_since[zone]

    def note_band(self, zone: str, in_band: bool) -> float | None:
        if in_band:
            self._out_of_band_since[zone] = None
        elif self._out_of_band_since[zone] is None:
            self._out_of_band_since[zone] = time.time()
        return self._out_of_band_since[zone]


class Registry:
    """Thread-safe map of device id → runtime."""

    def __init__(self) -> None:
        self._devices: dict[str, DeviceRuntime] = {}
        self._lock = threading.Lock()

    def load(self, rows: list[sqlite3.Row]) -> None:
        with self._lock:
            for row in rows:
                if row["id"] not in self._devices:
                    self._devices[row["id"]] = DeviceRuntime(
                        row["id"], row["label"], row["transport"], row["port"]
                    )

    def add(
        self, device_id: str, label: str, transport: str, port: str | None
    ) -> DeviceRuntime:
        with self._lock:
            runtime = DeviceRuntime(device_id, label, transport, port)
            self._devices[device_id] = runtime
            return runtime

    def remove(self, device_id: str) -> None:
        with self._lock:
            runtime = self._devices.pop(device_id, None)
        if runtime and runtime.connected:
            runtime.disconnect()

    def get(self, device_id: str) -> DeviceRuntime | None:
        return self._devices.get(device_id)

    def all(self) -> list[DeviceRuntime]:
        return list(self._devices.values())

    def disconnect_all(self) -> None:
        for runtime in self.all():
            if runtime.connected:
                runtime.disconnect()


registry = Registry()
