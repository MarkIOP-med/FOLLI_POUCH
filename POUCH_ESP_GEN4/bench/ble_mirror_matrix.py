"""Bench: the BLE mirror matrix against the live pouch, from a PC.

Plays the patient console's exact role over real BLE (same UUIDs, same text
grammar, write-with-response) while cross-checking the operator backend's
serial view at http://127.0.0.1:8000 — every mirroring claim in POUCH_ESP.md
verified in one run, with no phone in the loop.

    pip install bleak requests
    python ble_mirror_matrix.py        # pouch powered, backend connected on serial,
                                       # no other BLE central (phone app) attached

Exercises: advertising + MTU, periodic telemetry shape, readuser, the
patient-side START refusal on an unassigned board, user push/readback, START,
session clock, serial/BLE clock agreement, single-zone trim, one-shot
vibration with -1 semantics, STOP/vent/clock reset. Leaves user 42
(0/20/30/0 mmHg) assigned — a regime inside the patient ceiling, handy for a
phone demo right after.
"""
import asyncio
import sys
import time

import requests
from bleak import BleakClient, BleakScanner

SERVICE = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
CMD_CHAR = "beb5483e-36e1-4688-b7f5-ea07361b26a8"
TEL_CHAR = "d68a2a54-7f15-4ba5-bc44-59368d400d3b"
BACKEND = "http://127.0.0.1:8000/api/devices/POUCH-BENCH"

STATE_CHARS = {"I": "IDLE", "P": "PRESSURIZING", "M": "MAINTENANCE",
               "E": "EMERGENCY_RELIEF", "S": "STOPPED"}

lines = []          # every notify line, timestamped
results = []        # (name, ok, detail)
mark = [0]          # index into `lines` taken just before the last command write


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def parse_t(line):
    if not line.startswith("T:"):
        return None
    p = line[2:].split(",")
    if len(p) != 12 or p[0] not in STATE_CHARS:
        return None
    try:
        n = [int(x) for x in p[1:]]
    except ValueError:
        return None
    return {"state": STATE_CHARS[p[0]], "elapsed": n[0],
            "actuals": n[1:5], "targets": n[5:9], "batt": n[9], "err": n[10]}


async def wait_for(pred, timeout, desc):
    """Wait until a line arriving after the last send satisfies pred."""
    start_idx = mark[0]
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for _, ln in lines[start_idx:]:
            if pred(ln):
                return ln
        start_idx = len(lines)
        await asyncio.sleep(0.05)
    return None


async def wait_state(states, timeout):
    return await wait_for(
        lambda ln: (t := parse_t(ln)) is not None and t["state"] in states,
        timeout, f"state in {states}")


def backend_snapshot():
    try:
        return requests.get(BACKEND, timeout=3).json()
    except Exception as e:
        return {"error": str(e)}


async def main():
    print("== scanning ==")
    device = await BleakScanner.find_device_by_filter(
        lambda d, adv: (adv.local_name == "FOLLISAVE-POUCH"
                        or SERVICE in [u.lower() for u in adv.service_uuids]),
        timeout=15)
    check("advertising visible", device is not None,
          f"{device.address if device else 'not found in 15s'}")
    if not device:
        return

    async with BleakClient(device) as client:
        mtu = client.mtu_size
        check("connected + MTU", mtu >= 55, f"negotiated MTU {mtu}")

        def on_notify(_, data: bytearray):
            for raw in bytes(data).decode("utf-8", "replace").splitlines():
                raw = raw.strip()
                if raw:
                    lines.append((time.monotonic(), raw))

        await client.start_notify(TEL_CHAR, on_notify)

        async def send(cmd):
            print(f"  -> {cmd}")
            mark[0] = len(lines)
            await client.write_gatt_char(CMD_CHAR, cmd.encode(), response=True)

        # 1. periodic telemetry arrives, well-formed, 12 fields
        ln = await wait_for(lambda l: l.startswith("T:"), 3, "telemetry")
        t = parse_t(ln) if ln else None
        check("periodic telemetry parses (12 fields)", t is not None, repr(ln))
        if t:
            check("board idle before test", t["state"] in ("IDLE", "STOPPED"),
                  f"state={t['state']} elapsed={t['elapsed']}")

        # 2. readuser answers R:USER:
        await send("readuser")
        ln = await wait_for(lambda l: l.startswith("R:USER:"), 3, "readuser")
        check("readuser -> R:USER over BLE", ln is not None, repr(ln))

        # 2b. fresh boot = unassigned: a patient-side START must be refused
        if ln and ",false," in ln:
            await send("start")
            ln2 = await wait_for(lambda l: l.startswith("ERR:START:NO_USER_ASSIGNED"), 3, "start refused")
            check("START refused while unassigned", ln2 is not None, repr(ln2))
            ln3 = await wait_state({"PRESSURIZING", "MAINTENANCE"}, 1.5)
            check("board stayed idle after refused START", ln3 is None, "")
        else:
            print("  [SKIP] unassigned-START check (board already has a user assigned)")

        # 3. push a bench regime within the patient ceiling, verify readback
        await send("user:42:0,20,30,0")
        ln = await wait_for(lambda l: l.startswith("OK:USER"), 3, "user ack")
        check("user push acked", ln is not None, repr(ln))
        await send("readuser")
        ln = await wait_for(lambda l: l.startswith("R:USER:42,true,0,20,30,0"), 3, "user readback")
        check("user readback exact", ln is not None, repr(ln))

        # 4. START -> OK, state P, clock starts, targets = regime
        await send("start")
        ln = await wait_for(lambda l: l.startswith("OK:START"), 3, "start ack")
        check("start acked", ln is not None, repr(ln))
        ln = await wait_state({"PRESSURIZING", "MAINTENANCE"}, 8)
        t = parse_t(ln) if ln else None
        check("state -> PRESSURIZING/MAINTENANCE", t is not None,
              f"{t['state'] if t else 'no frame'}")
        if t:
            check("targets applied from user regime", t["targets"] == [0, 20, 30, 0],
                  f"targets={t['targets']}")

        await asyncio.sleep(3)
        latest = next((parse_t(l) for _, l in reversed(lines) if parse_t(l)), None)
        check("session clock running", latest is not None and latest["elapsed"] >= 2,
              f"elapsed={latest['elapsed'] if latest else '?'}")

        # 5. admin backend (serial) mirrors the BLE-started session
        snap = backend_snapshot()
        check("serial mirror: device_state running",
              snap.get("device_state") in ("PRESSURIZING", "MAINTENANCE"),
              f"backend device_state={snap.get('device_state')}")
        check("serial mirror: clock matches (±3s)",
              latest is not None and snap.get("device_elapsed_s") is not None
              and abs(snap["device_elapsed_s"] - latest["elapsed"]) <= 3,
              f"backend={snap.get('device_elapsed_s')} ble={latest['elapsed'] if latest else '?'}")

        # 6. zone trim mid-run: only that zone's target changes
        await send("setpressure:1,25")
        ln = await wait_for(lambda l: l.startswith("OK:SETPRESSURE:1,25"), 3, "set ack")
        check("setpressure acked", ln is not None, repr(ln))
        ln = await wait_for(
            lambda l: (t := parse_t(l)) is not None and t["targets"] == [0, 25, 30, 0], 3, "trim")
        check("trim visible in telemetry, others untouched", ln is not None,
              repr(ln) if ln else "targets never showed [0,25,30,0]")

        # 7. massage one-shot with -1 semantics
        await send("setvibration:-1,2,-1,-1")
        ln = await wait_for(lambda l: l.startswith("OK:SETVIBRATION"), 3, "vib ack")
        check("vibration one-shot acked", ln is not None, repr(ln))

        # 8. STOP -> vent -> idle, clock resets, serial mirror sees it
        await send("stop")
        ln = await wait_for(lambda l: l.startswith("OK:STOP"), 3, "stop ack")
        check("stop acked", ln is not None, repr(ln))
        ln = await wait_state({"IDLE", "STOPPED"}, 25)   # pulsed vent can take a while
        t = parse_t(ln) if ln else None
        check("vent completed -> idle", t is not None, f"{t['state'] if t else 'timed out'}")
        if t:
            check("clock reset after stop", t["elapsed"] == 0, f"elapsed={t['elapsed']}")
            check("targets zeroed after stop", t["targets"] == [0, 0, 0, 0],
                  f"targets={t['targets']}")
        snap = backend_snapshot()
        check("serial mirror: idle after BLE stop",
              snap.get("device_state") in ("IDLE", "STOPPED", "EMERGENCY_RELIEF"),
              f"backend device_state={snap.get('device_state')}")

        await client.stop_notify(TEL_CHAR)

    fails = [r for r in results if not r[1]]
    print(f"\n== {len(results) - len(fails)}/{len(results)} passed ==")
    if fails:
        print("FAILED:")
        for name, _, detail in fails:
            print(f"  - {name}: {detail}")
    print("\nlast 15 raw lines:")
    for _, ln in lines[-15:]:
        print("   ", ln)
    sys.exit(1 if fails else 0)


asyncio.run(main())
