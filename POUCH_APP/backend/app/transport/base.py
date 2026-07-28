"""Transport abstraction.

The pouch speaks USB serial today. The Due on the bench has no radio at all, so BLE
is a future ESP32 swap -- this interface exists so that swap touches one file.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable

from ..core.zones import ZONES

# Telemetry CSV emitted by POUCH_ESP_GEN4/serial.ino, one line per loop().
TELEMETRY_FIELDS = ["time", "FRN_T", "FRN_A", "TMP_T", "TMP_A", "EAR_T", "EAR_A", "BCK_T", "BCK_A", "MAN", "FSR_FRN_L", "FSR_FRN_R", "FSR_TMP_L", "FSR_TMP_R", "FSR_EAR_L", "FSR_EAR_R", "FSR_BCK_L", "FSR_BCK_R"]

FSR_COLUMNS = {
    "FRONT": ("FSR_FRN_L", "FSR_FRN_R"),
    "TEMPLE": ("FSR_TMP_L", "FSR_TMP_R"),
    "EAR": ("FSR_EAR_L", "FSR_EAR_R"),      # stubbed to 0 in firmware
    "BACK": ("FSR_BCK_L", "FSR_BCK_R"),
}
TARGET_COLUMNS = {"FRONT": "FRN_T", "TEMPLE": "TMP_T", "EAR": "EAR_T", "BACK": "BCK_T"}
ACTUAL_COLUMNS = {"FRONT": "FRN_A", "TEMPLE": "TMP_A", "EAR": "EAR_A", "BACK": "BCK_A"}


def parse_telemetry(line: str) -> dict | None:
    """Parse one CSV line. Returns None for banners, logs and anything malformed."""
    parts = [p.strip() for p in line.split(",")]
    if len(parts) != len(TELEMETRY_FIELDS) or not parts[0].isdigit():
        return None
    try:
        raw = {name: int(parts[i]) for i, name in enumerate(TELEMETRY_FIELDS)}
    except ValueError:
        return None

    zones = {}
    for zone in ZONES:
        left, right = FSR_COLUMNS[zone]
        zones[zone] = {
            "target": raw[TARGET_COLUMNS[zone]],
            "actual": raw[ACTUAL_COLUMNS[zone]],
            "fsr_l": raw[left],
            "fsr_r": raw[right],
        }
    return {"device_ms": raw["time"], "manifold": raw["MAN"], "zones": zones}


class Link:
    """Base transport. Subclasses implement _open/_close/_write/_read_line."""

    def __init__(self, device_id: str, on_telemetry: Callable[[dict], None],
                 on_log: Callable[[str], None]):
        self.device_id = device_id
        self._on_telemetry = on_telemetry
        self._on_log = on_log
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
            frame = parse_telemetry(line)
            if frame is None:
                self._on_log(line)
            else:
                self._note_frame()
                self._on_telemetry(frame)

    # -- commands ----------------------------------------------------------
    def set_targets(self, targets: dict[str, int]) -> str:
        """targets maps zone name -> mmHg. Sent as the batch 'ch,val;ch,val' form."""
        from ..core.zones import index_of
        parts = [f"{index_of(z)},{int(v)}" for z, v in targets.items()]
        cmd = ";".join(parts)
        self._write(cmd + "\n")
        return cmd

    def stop(self) -> str:
        """Sends 'r', NOT 's'.

        Verified on hardware: 's' sets currentState = STOPPED, runStateMachine()
        returns at its first line, and nothing writes PUMP_PIN LOW -- the pump keeps
        running. Only reliefAllPads(), reached via 'r', actually shuts it off.
        A control labelled STOP must actually stop the pump.
        """
        self._write("r\n")
        return "r"

    def emergency(self) -> str:
        self._write("r\n")
        return "r"

    def rezero(self) -> str:
        """Re-capture the atmospheric baseline.

        The firmware has no such command yet: setup() captures the reference 500 ms
        after boot, before the sensors settle, and 'r' vents without re-capturing.
        Bench-measured consequence is ~44 mmHg of phantom pressure on TEMPLE.
        Venting is the closest available approximation until a 'z' command exists.
        """
        self._write("r\n")
        return "r (no re-zero command in firmware yet)"

    # -- subclass hooks ----------------------------------------------------
    def _open(self) -> None: raise NotImplementedError
    def _close(self) -> None: raise NotImplementedError
    def _write(self, data: str) -> None: raise NotImplementedError
    def _read_line(self) -> str: raise NotImplementedError
