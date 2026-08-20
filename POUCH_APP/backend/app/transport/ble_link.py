"""BLE transport — interface-ready stub.

The firmware (POUCH_ESP_GEN4/ble.ino) runs a NimBLE GATT server advertising as
"FOLLISAVE-POUCH" and carries the SAME text lines as serial: commands are written
to the command characteristic, and the telemetry characteristic notifies both the
periodic "T:" frames and the tagged "R:"/"OK:"/"ERR:" responses. Because the grammar
lives in protocol.py and Link._read_loop already routes decoded lines, a working
BLE transport is exactly this file plus the `bleak` dependency — no other layer
changes.

Implementation notes for whoever fills this in (from the firmware source + bench):
- Library: `bleak` (async) — run its event loop on a dedicated thread and bridge
  _write/_read_line through thread-safe queues, so the sync Link contract holds.
- Commands longer than the default ~20-byte ATT MTU (e.g. "setuserdefaultpressure:
  25,120,85,130") need the client to negotiate a larger MTU (NimBLE supports ~247)
  or use Write-With-Response so the stack's long-write path reassembles them.
- Notifies are MTU-bound with NO long-notify reassembly: without a negotiated MTU
  a long response (READ ALL) arrives truncated. Prefer individual read commands
  over BLE, or negotiate the MTU first.
- Notifications are line-per-notify (no framing/newline needed), but tolerate both.
"""

from __future__ import annotations

from .base import Link

SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
CHAR_COMMAND_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"   # write / write-no-response
CHAR_TELEMETRY_UUID = "d68a2a54-7f15-4ba5-bc44-59368d400d3b"  # notify
ADVERTISED_NAME = "FOLLISAVE-POUCH"


class BleLink(Link):
    """Placeholder — declares the contract; raises until implemented."""

    def __init__(self, device_id, address, on_telemetry, on_log, on_response=None):
        super().__init__(device_id, on_telemetry, on_log, on_response)
        self.address = address  # BLE MAC / OS device address, analogous to a COM port

    def _open(self) -> None:
        raise NotImplementedError(
            "BLE transport not implemented yet — install 'bleak' and implement "
            "_open/_close/_write/_read_line per this module's docstring. The wire "
            "grammar needs no changes; it is shared via transport/protocol.py."
        )

    def _close(self) -> None:
        pass

    def _write(self, data: str) -> None:
        raise NotImplementedError("BLE transport not implemented yet")

    def _read_line(self) -> str:
        raise NotImplementedError("BLE transport not implemented yet")
