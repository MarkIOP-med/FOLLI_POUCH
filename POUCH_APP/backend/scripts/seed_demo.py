"""Seed demo data so the screens have something to show.

Run with the server up:  python scripts/seed_demo.py
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"

PEOPLE = [
    ("EDNA BERMINGTON", "123456782", [40, 40, 0, 35], [1, 2, 0, 1]),
    ("YOSSI AVRAHAM", None, [30, 30, 10, 30], [1, 1, 0, 2]),
]
ZONES = ("FRONT", "TEMPLE", "EAR", "BACK")


def call(method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        print(f"  ({method} {path} -> {exc.code} {exc.read().decode()[:120]})")
        return None


def main() -> None:
    existing = {p["full_name"] for p in call("GET", "/api/patients") or []}

    for name, national_id, pressures, levels in PEOPLE:
        if name in existing:
            continue
        call("POST", "/api/patients", {
            "full_name": name,
            "national_id": national_id,
            "prescriptions": [
                {
                    "zone": zone,
                    "prescribed_mmhg": pressure,
                    "massage_level": level,
                    "massage_seconds": 30,
                }
                for zone, pressure, level in zip(ZONES, pressures, levels, strict=True)
            ],
        })
        print(f"created {name}")

    # A second mock pouch so the board is not a single card.
    call("POST", "/api/devices", {
        "id": "POUCH-01", "label": "Bay 1", "transport": "mock", "port": None,
    })

    patients = call("GET", "/api/patients") or []
    if patients:
        call("POST", "/api/devices/POUCH-MOCK/connect")
        call("POST", "/api/devices/POUCH-MOCK/session",
             {"patient_id": patients[0]["id"]})
        call("POST", "/api/devices/POUCH-MOCK/apply")
        print(f"POUCH-MOCK running a session for {patients[0]['full_name']}")

    call("POST", "/api/devices/POUCH-01/connect")
    call("POST", "/api/devices/POUCH-01/session", {"patient_id": None})
    print("POUCH-01 in service mode")
    print("seeded")


if __name__ == "__main__":
    main()
