"""Synthetic pouch so the whole app is usable with no hardware attached.

Deliberately imitates the real board's observed misbehaviour, not an idealised one:
a slow pressure ramp, sensor noise, and (optionally) the phantom offset and railed
FSRs measured on the bench. A mock that only produces clean data hides exactly the
UI states that matter.
"""

from __future__ import annotations

import math
import queue
import random
import threading
import time

from ..core.zones import ZONES
from .base import Link

FRAME_INTERVAL = 1 / 12.0     # matches the measured 9600-baud ceiling (~12.3 Hz)


class MockLink(Link):
    def __init__(self, device_id, on_telemetry, on_log, realistic_faults: bool = True):
        super().__init__(device_id, on_telemetry, on_log)
        self.realistic_faults = realistic_faults
        self._targets = [0, 0, 0, 0]
        self._actual = [0.0, 0.0, 0.0, 0.0]
        self._manifold = 0.0
        self._t0 = time.time()
        self._lines: queue.Queue[str] = queue.Queue()
        self._pump: threading.Thread | None = None

    def _open(self) -> None:
        self._t0 = time.time()
        self._lines.put("=== FOLLI_CNTRL_Gen3 - FOLLISAVE Controller ===")
        self._lines.put("Ready. No pressure applied.")
        self._pump = threading.Thread(target=self._generate, daemon=True)
        self._pump.start()

    def _close(self) -> None:
        pass

    def _write(self, data: str) -> None:
        cmd = data.strip()
        if cmd in ("r", "emergency"):
            self._targets = [0, 0, 0, 0]
            self._lines.put("→ EMERGENCY RELIEF")
            self._lines.put("All PADs relieved to zero.")
            return
        if cmd == "s":
            self._lines.put("→ System STOPPED")
            return
        for part in cmd.split(";"):
            if "," not in part:
                continue
            ch_s, val_s = part.split(",", 1)
            try:
                ch, val = int(ch_s), int(val_s)
            except ValueError:
                continue
            if 0 <= ch < 4:
                self._targets[ch] = val
                self._lines.put(f"→ Ch{ch} = {val}")

    def _read_line(self) -> str:
        try:
            return self._lines.get(timeout=0.5)
        except queue.Empty:
            return ""

    # -- synthetic physics -------------------------------------------------
    def _generate(self) -> None:
        while not self._stop.is_set():
            time.sleep(FRAME_INTERVAL)

            for i in range(4):
                target = self._targets[i]
                # first-order approach to target, plus a little sensor noise
                self._actual[i] += (target - self._actual[i]) * 0.08
                self._actual[i] += random.uniform(-0.4, 0.4)
                self._actual[i] = max(0.0, self._actual[i])
            self._manifold = max(self._actual) * 0.9 + random.uniform(-0.3, 0.3)

            ms = int((time.time() - self._t0) * 1000)
            vals = [str(ms)]
            for i, zone in enumerate(ZONES):
                offset = 0
                if self.realistic_faults and zone == "TEMPLE":
                    # phantom offset from the too-early reference capture at boot
                    offset = 44 if (time.time() - self._t0) > 4 else int(
                        44 * (time.time() - self._t0) / 4)
                vals.append(str(self._targets[i]))
                vals.append(str(int(self._actual[i]) + offset))
            vals.append(str(int(max(0.0, self._manifold))))

            for zone in ZONES:
                if zone == "EAR":
                    vals += ["0", "0"]                       # stubbed in firmware
                elif self.realistic_faults and zone != "TEMPLE":
                    vals += ["4095", "4095"]                 # open circuit
                else:
                    jitter = int(3300 + 40 * math.sin(time.time() * 2))
                    vals += ["4095" if self.realistic_faults else "2100", str(jitter)]

            self._lines.put(",".join(vals))
