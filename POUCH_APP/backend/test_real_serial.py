"""Verify the real Arduino path through the app. Read-only: connects and reads
telemetry, sends no pressure commands and never runs the pump.

Server must be running. Close the Arduino IDE serial monitor first -- Windows gives
exclusive access to the port.
"""

import json
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
PORT = "COM5"
DEV = "POUCH-DUE"


def call(method, path, body=None, quiet=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        if not quiet:
            print(f"  {method} {path} -> {e.code}: {e.read().decode()[:160]}")
        return None


call("DELETE", f"/api/devices/{DEV}", quiet=True)
call("POST", "/api/devices",
     {"id": DEV, "label": "Bench Due", "transport": "serial", "port": PORT})

print(f"connecting to {PORT} ...")
if call("POST", f"/api/devices/{DEV}/connect") is None:
    raise SystemExit("could not open the port -- is the Arduino IDE monitor open?")

time.sleep(8)
snap = call("GET", f"/api/devices/{DEV}")

print(f"connected={snap['connected']} rate={snap['rate_hz']} Hz "
      f"service_mode={snap['service_mode']}")
print(f"manifold={snap['manifold_mmhg']} fault={snap['manifold_fault']}")
for z in snap["zones"]:
    fl = z["fsr_l"]["state"] if z["fsr_l"] else "-"
    fr = z["fsr_r"]["state"] if z["fsr_r"] else "-"
    print(f"  {z['zone']:<7} actual={str(z['actual_mmhg']):>4} "
          f"status={z['status']:<13} fsr L={fl} R={fr}")

print("\nserial log tail:")
for line in (snap.get("technical", {}).get("log_tail") or [])[-6:]:
    print("  " + line)

assert snap["connected"], "device reports disconnected"
assert snap["rate_hz"] > 5, f"telemetry too slow: {snap['rate_hz']} Hz"
assert snap["zones"][0]["actual_mmhg"] is not None, "no telemetry parsed"

# Vent before disconnecting, the same way end_session does. No target was ever sent,
# but opening the port resets the board, and given the phase-2 pump path has no
# timeout, "disconnect without venting" is not a habit worth building.
call("POST", f"/api/devices/{DEV}/emergency")
time.sleep(1)

call("DELETE", f"/api/devices/{DEV}/connect")
call("DELETE", f"/api/devices/{DEV}")
print("\nREAL HARDWARE PATH OK (read-only, pump never ran, vented on exit)")
