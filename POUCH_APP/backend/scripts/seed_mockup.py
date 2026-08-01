"""Seed the exact data the design mockups show.

The visual diff compares rendered pixels against the mockups, so any difference in
*content* — a different patient name, different pressures — counts as a mismatch
even when the layout is perfect. Seeding the mockup's own figures isolates layout
and style fidelity from data differences, which is the thing actually being built.

Figures taken from diagnostics_ui_04_PAGE_02 / PAGE_03, plus the six-slot roster
from PAGE_01.

Battery levels and pump/valve state are deliberately NOT seeded: no firmware
reports them, so those regions of the mockup stay unmatched on purpose rather
than being filled with invented readings.

Usage:  python scripts/seed_mockup.py       (server must be running)
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8000"
DEVICE = "POUCH-MOCKUP"

# PAGE_02 header + User Regime panel.
PATIENT = {
    "full_name": "Natalie Mitchell",
    # The mockup prints 26512679-6, whose check digit does not validate — it is
    # placeholder art. Keeping the same 8-digit stem and computing the correct
    # final digit gives a realistic, valid ID that renders almost identically,
    # rather than either leaving the field blank or disabling validation.
    "national_id": None,  # replaced below with the stem + correct check digit
    "gender": "female",
    "birth_year": 1959,          # renders as age 67
    "protocol": "001.26.3",
    "treatment_number": 2,
    "prescriptions": [
        {"zone": "FRONT",  "prescribed_mmhg": 26, "massage_level": 3, "massage_seconds": 20},
        {"zone": "TEMPLE", "prescribed_mmhg": 36, "massage_level": 2, "massage_seconds": 15},
        {"zone": "EAR",    "prescribed_mmhg": 52, "massage_level": 1, "massage_seconds": 25},
        {"zone": "BACK",   "prescribed_mmhg": 42, "massage_level": 1, "massage_seconds": 30},
    ],
}


# PAGE_01 — the User Overview grid. Slot 01 is the patient above; slots 02..05
# fill out the grid and slot 06 is left empty, as drawn. Each needs its own pouch,
# so the ids differ from the mockup's single "POUCH_ID" placeholder.
#
# The national-id stems get a computed check digit for the same reason as above.
ROSTER = [
    ("Emanual Dunshear",  "male",   1972, "31251143"),
    ("Jennifer Danekyn",  "female", 1966, "24418862"),
    ("Shondra Felssory",  "female", 1981, "19935274"),
    ("Madison Paisley",   "female", 1994, "28806451"),
]

# Slot 06 is drawn empty, so a sixth pouch exists with no session on it.
EMPTY_SLOT = "POUCH-06"


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
        print(f"  ({method} {path} -> {exc.code} {exc.read().decode()[:140]})")
        return None


def main() -> None:
    # Import lazily so the script still runs from the repo root or scripts/.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.core.israeli_id import check_digit

    stem = "26512679"
    PATIENT["national_id"] = f"{stem}{check_digit(stem)}"

    existing = {p["full_name"]: p for p in call("GET", "/api/patients") or []}
    patient = existing.get(PATIENT["full_name"])

    if patient is None:
        patient = call("POST", "/api/patients", PATIENT)
        if patient is None:
            raise SystemExit("could not create the mockup patient")
        print(f"created {patient['full_name']} (MRN {patient['mrn']})")
    else:
        call("PUT", f"/api/patients/{patient['id']}", PATIENT)
        print(f"updated {patient['full_name']}")

    call("POST", "/api/devices", {
        "id": DEVICE, "label": "Mockup", "transport": "mock", "port": None,
    })
    call("POST", f"/api/devices/{DEVICE}/connect")

    snapshot = call("GET", f"/api/devices/{DEVICE}")
    if snapshot and snapshot.get("session_id"):
        call("DELETE", f"/api/devices/{DEVICE}/session")
    call("POST", f"/api/devices/{DEVICE}/session", {"patient_id": patient["id"]})
    call("POST", f"/api/devices/{DEVICE}/apply")

    print(f"{DEVICE} running a session for {patient['full_name']}")

    # ── PAGE_01 roster ────────────────────────────────────────────────────────
    for index, (name, gender, birth_year, stem) in enumerate(ROSTER, start=2):
        device = f"POUCH-{index:02d}"
        body = {
            "full_name": name,
            "national_id": f"{stem}{check_digit(stem)}",
            "gender": gender,
            "birth_year": birth_year,
            "protocol": PATIENT["protocol"],
            "treatment_number": 1,
            "prescriptions": PATIENT["prescriptions"],
        }
        person = existing.get(name)
        if person is None:
            person = call("POST", "/api/patients", body)
            if person is None:
                continue
        else:
            call("PUT", f"/api/patients/{person['id']}", body)

        call("POST", "/api/devices", {
            "id": device, "label": f"Slot {index:02d}",
            "transport": "mock", "port": None,
        })
        call("POST", f"/api/devices/{device}/connect")
        snap = call("GET", f"/api/devices/{device}")
        if snap and snap.get("session_id"):
            call("DELETE", f"/api/devices/{device}/session")
        call("POST", f"/api/devices/{device}/session", {"patient_id": person["id"]})
        call("POST", f"/api/devices/{device}/apply")
        print(f"{device} running a session for {name}")

    call("POST", "/api/devices", {
        "id": EMPTY_SLOT, "label": "Slot 06", "transport": "mock", "port": None,
    })
    print(f"{EMPTY_SLOT} left idle (slot 06 is drawn empty)")

    print("diff against:  /  and  /diagnostics/" + DEVICE)


if __name__ == "__main__":
    main()
