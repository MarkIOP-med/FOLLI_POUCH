"""Synthetic pouch so the whole app is usable with no hardware attached.

Speaks the same FOLLI text grammar as the real Gen4 firmware (protocol.py /
POUCH_ESP.md): "T:"-prefixed telemetry frames and tagged OK:/ERR:/R: responses.
Deliberately imitates the real board's observed misbehaviour, not an idealised one:
a slow pressure ramp, sensor noise, and (optionally) railed/dead FSR channels as
measured on the bench. A mock that only produces clean data hides exactly the UI
states that matter.
"""

from __future__ import annotations

import math
import queue
import random
import threading
import time

from ..core.zones import ZONES
from .base import Link

FRAME_INTERVAL = 0.2   # firmware SERIAL_LOG_INTERVAL_MS = 200ms (5 Hz)

# Mirrors the bench board's systemDefaultPressure {0, 95, 125, 0}: FRONT/BACK zeroed
# for the physical valve fault, TEMPLE/EAR live.
DEFAULT_PRESSURES = [0, 95, 125, 0]


class MockLink(Link):
    def __init__(self, device_id, on_telemetry, on_log, on_response=None,
                 realistic_faults: bool = True):
        super().__init__(device_id, on_telemetry, on_log, on_response)
        self.realistic_faults = realistic_faults
        self._targets = [0, 0, 0, 0]
        self._vib = [0, 0, 0, 0]
        self._actual = [0.0, 0.0, 0.0, 0.0]
        self._manifold = 0.0
        self._t0 = time.time()
        self._session_start: float | None = None   # mirrors firmware sessionStartMs
        self._lines: queue.Queue[str] = queue.Queue()
        self._pump: threading.Thread | None = None

    def _state_char(self) -> str:
        if not any(self._targets):
            return "I"
        # settled within the firmware tolerance → MAINTENANCE, else PRESSURIZING
        settled = all(abs(a - t) <= 3 for a, t in zip(self._actual, self._targets))
        return "M" if settled else "P"

    def _elapsed_s(self) -> int:
        return int(time.time() - self._session_start) if self._session_start else 0

    def _note_targets_changed(self) -> None:
        if any(self._targets):
            if self._session_start is None:
                self._session_start = time.time()
        else:
            self._session_start = None

    def _open(self) -> None:
        self._t0 = time.time()
        self._lines.put("BLE GATT server started — advertising as FOLLISAVE-POUCH")
        self._lines.put("Venting system to atmosphere...")
        self._lines.put("Ready. No pressure applied.")
        self._pump = threading.Thread(target=self._generate, daemon=True)
        self._pump.start()

    def _close(self) -> None:
        pass

    # -- command handling: same grammar as commandParser.ino ----------------
    def _write(self, data: str) -> None:
        cmd = data.strip()
        word, _, rest = cmd.partition(":")
        word = word.lower()

        if word == "stop":
            self._targets = [0, 0, 0, 0]
            self._vib = [0, 0, 0, 0]
            self._note_targets_changed()
            self._lines.put("OK:STOP")
            self._lines.put("All PADs relieved to zero.")
        elif word == "start":
            self._targets = list(DEFAULT_PRESSURES)
            self._session_start = None
            self._note_targets_changed()
            self._lines.put("OK:START")
        elif word == "restart":
            self._targets = [0, 0, 0, 0]
            self._note_targets_changed()
            self._lines.put("OK:RESTART")
        elif word == "resetall":
            self._targets = list(DEFAULT_PRESSURES)
            self._session_start = None
            self._note_targets_changed()
            self._lines.put("OK:RESETALL")
        elif word == "user":
            self._lines.put(f"OK:USER:{rest.split(':', 1)[0]}")
        elif word == "setpressure":
            for part in rest.split(";"):
                if "," not in part:
                    continue
                ch_s, val_s = part.split(",", 1)
                try:
                    ch, val = int(ch_s), int(val_s)
                except ValueError:
                    continue
                if 0 <= ch < 4:
                    self._targets[ch] = val
                    self._note_targets_changed()
                    self._lines.put(f"OK:SETPRESSURE:{ch},{val}")
        elif word == "setvibration":
            try:
                levels = [int(v) for v in rest.split(",")]
            except ValueError:
                self._lines.put("ERR:SETVIBRATION:no values given")
                return
            for i, lv in enumerate(levels[:4]):
                if lv < 0:
                    continue  # -1 = leave unchanged, like the firmware
                self._vib[i] = max(0, min(3, lv))
            self._lines.put("OK:SETVIBRATION")
        elif word == "readstate":
            state = "IDLE" if not any(self._targets) else "MAINTENANCE"
            self._lines.put(f"R:STATE:{state}")
        elif word == "readpressure":
            s = ",".join(str(int(a)) for a in self._actual)
            t = ",".join(str(t) for t in self._targets)
            self._lines.put(f"R:PRESSURE:{s},{int(self._manifold)},{t}")
        elif word == "readvibration":
            self._lines.put("R:VIBRATION:" + ",".join(str(v) for v in self._vib))
        else:
            self._lines.put(f"ERR:UNKNOWN:{cmd}")

    def _read_line(self) -> str:
        try:
            return self._lines.get(timeout=0.5)
        except queue.Empty:
            return ""

    # -- synthetic physics -------------------------------------------------
    def _generate(self) -> None:
        header_sent = False
        while not self._stop.is_set():
            time.sleep(FRAME_INTERVAL)

            for i in range(4):
                target = self._targets[i]
                # first-order approach to target, plus a little sensor noise
                self._actual[i] += (target - self._actual[i]) * 0.08
                self._actual[i] += random.uniform(-0.4, 0.4)
                self._actual[i] = max(0.0, self._actual[i])
            self._manifold = max(self._actual) * 0.9 + random.uniform(-0.3, 0.3)

            if not header_sent:
                self._lines.put(
                    "T:time,FRN_T,FRN_A,TMP_T,TMP_A,EAR_T,EAR_A,BCK_T,BCK_A,MAN,"
                    "FSR0,FSR1,FSR2,FSR3,FSR4,FSR5,FSR6,FSR7,STATE,ELAPSED"
                )
                header_sent = True

            ms = int((time.time() - self._t0) * 1000)
            vals = [str(ms)]
            for i in range(4):
                vals.append(str(self._targets[i]))
                vals.append(str(int(self._actual[i])))
            vals.append(str(int(max(0.0, self._manifold))))

            # FSR faults, two real flavours: a railed 4095 (open circuit — the app
            # must surface it as FAULT, never as a number) and the bench's dead
            # FLOW_LINK side reading flat 0 (2026-08-20; channels 0-3). The live side
            # idles near 0 and reads ~full-scale (1023, 10-bit MCP3008) when pressed.
            for ch in range(8):
                if self.realistic_faults and ch < 2:
                    vals.append("4095")                   # open circuit, railed
                elif self.realistic_faults and ch < 4:
                    vals.append("0")                      # dead harness side
                else:
                    jitter = int(5 + 4 * math.sin(time.time() * 2 + ch))
                    vals.append(str(max(0, jitter)))

            vals.append(self._state_char())
            vals.append(str(self._elapsed_s()))

            self._lines.put("T:" + ",".join(vals))
