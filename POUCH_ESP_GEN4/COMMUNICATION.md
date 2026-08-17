# FOLLISAVE Communication & Data API

Shared description of every variable that moves between **POUCH** (ESP32 firmware), **CONSOLE**
(patient-facing BLE client), and **POUCH_APP / POUCH_DIAGNOSTICS** (admin tablet/PC, the full
multi-user database). This is the target design — edit this file as the API evolves. It does
not always match what's currently implemented; check the **Status** column.

## Architecture in three bullets

- **POUCH (ESP32)** is the driver. Live session state lives in RAM; one checked-out user's
  regime (target pressure / vibration defaults + threshold) lives durably in NVS flash.
  One user per device at a time — a future clear/hard-reset wipes the NVS record.
- **CONSOLE** is a thin relay/display. It reads and writes through POUCH and holds no
  authoritative data of its own.
- **POUCH_APP (POUCH_DIAGNOSTICS)** holds the full archive — every user ever assigned to any
  pouch, their identity, and a backup copy of their regime, so nothing is lost if a pouch is
  reassigned and later handed back to a previous user.

> **Ownership rule:** for any given user, exactly one side is "live" at a time — POUCH while
> they're checked out to it, POUCH_APP's archive while they're not. No field is ever written
> from two places at once.

---

## Quick index

| Variable | Group | Status |
|---|---|---|
| Actual Pressure | Pneumatics | ✅ Implemented |
| FSR Pressure | Pneumatics | ✅ Implemented |
| Default Target Pressure | Pneumatics | ✅ Implemented (constant) |
| Default User Target Pressure | Pneumatics | 🔧 Planned |
| Current User Target Pressure | Pneumatics | ✅ Implemented |
| Pressure Threshold | Pneumatics | 🔧 Planned |
| Pressure Tolerance | Control Loop Tuning | 🆕 Candidate |
| Actuation Threshold | Control Loop Tuning | 🆕 Candidate |
| Telemetry Interval | Control Loop Tuning | 🆕 Candidate |
| Sensor Calibration | Control Loop Tuning | 🆕 Candidate — service/calibration tier |
| Valve/Pump Timing | Control Loop Tuning | 🆕 Candidate — needs naming first |
| Valves Diagnostics | Diagnostics | 🔧 Planned |
| Manifold Diagnostics | Diagnostics | 🔧 Planned |
| Vibration Levels | Vibration | ✅ Implemented (constant) |
| Vibration Channels | Vibration | ✅ Implemented |
| Vibration Duration Time | Vibration | ✅ Implemented |
| Vibration Time per channel | Vibration | 🔧 Planned |
| Session Time | User Data | ❗ Gap (no RTC) |
| Start time | User Data | ❗ Gap (no RTC) |
| User Data (identity) | User Data | 🔧 Planned |
| Session Operation Stage | User Data | ✅ Implemented (= `currentState`) |
| User ID | User Data | 🔧 Planned |
| Assigned | User Data | 🔧 Planned |
| CONSOLE device info | Devices | 🔧 Planned |
| POUCH device info | Devices | ❗ Gap / 🔧 Planned |

---

## Legend

**Storage**
- `ESP-RAM` — ESP32 RAM, live session value, lost on power-cycle
- `ESP-NVS` — ESP32 flash (`Preferences`), the checked-out user's record, persists
- `ESP-CONST` — compile-time constant in `config.h`, needs a reflash to change
- `APP-JSON` — POUCH_APP's JSON database, the durable multi-user archive
- `CONSOLE-LOCAL` — lives on the CONSOLE device itself, not synced through POUCH

**Changed via** — `Serial` · `BLE` · `WiFi` *(planned)* · `Console UI` · `POUCH_APP UI` · `System` (automatic, not a direct write)

**Status** — ✅ Implemented · 🔧 Planned (designed, not built) · 🆕 Candidate (proposed, access tier/decision not yet made) · ❗ Gap (known limitation, unresolved) · ⚠️ Implemented but mismatched with this spec

---

## PNEUMATICS

**Definition**

| Variable | Default | Structure | Description |
|---|---|---|---|
| Actual Pressure | `(0,0,0,0,0)` | `[MANIFOLD, FRONT, TEMPLE, EAR, BACK]` mmHg | Live sensor readings |
| FSR Pressure | `(0×8)` | `[FRONT_L, FRONT_R, TEMPLE_L, TEMPLE_R, EAR_L, EAR_R, BACK_L, BACK_R]` | Raw force-sensor ADC reads |
| Default Target Pressure | `(25,120,85,130)` | `[FRONT, TEMPLE, EAR, BACK]` mmHg | Global factory default, all users |
| Default User Target Pressure | `(25,120,85,130)` | `[FRONT, TEMPLE, EAR, BACK]` mmHg | This user's saved regime, loaded at session start |
| Current User Target Pressure | `(25,120,85,130)` | `[FRONT, TEMPLE, EAR, BACK]` mmHg | Live in-session target |
| Pressure Threshold | `(5,15,10,15)` | `[FRONT, TEMPLE, EAR, BACK]` mmHg | Max drift of Current from Default, per channel |

**Access**

| Variable | Read/Write | Storage | Changed Via | Status |
|---|---|---|---|---|
| Actual Pressure | Read-only | `ESP-RAM` | System | ✅ |
| FSR Pressure | Read-only | `ESP-RAM` | System | ✅ (L/R mapping unconfirmed) |
| Default Target Pressure | R/W *(open question)* | `ESP-CONST` | Reflash only | ✅ (values now match, `{25,120,85,130}`) |
| Default User Target Pressure | R/W | `ESP-NVS` + `APP-JSON` mirror | Save-as-default; Restore-from-archive | 🔧 |
| Current User Target Pressure | R/W | `ESP-RAM` | Serial, BLE, WiFi *(planned)* | ✅ |
| Pressure Threshold | R/W, **admin only** | `ESP-NVS` + `APP-JSON` mirror | Serial/BLE/WiFi, admin-gated | 🔧 (not enforced yet) |

---

## CONTROL LOOP TUNING

Candidates identified while auditing the rest of `config.h`/the `.ino` files for values that
are currently hardcoded but might reasonably need tuning without a reflash. None of these are
decided yet — see "Open items" below.

**Definition**

| Variable | Default | Structure | Description |
|---|---|---|---|
| Pressure Tolerance | `3` mmHg | scalar | ± dead-band for "at target" in the control loop |
| Actuation Threshold | `10` mmHg | scalar | Below this, a zero-target channel is skipped rather than actuated (avoids sensor-noise chatter). **Not the same thing as "Pressure Threshold" in PNEUMATICS** — that one bounds how far a user may adjust off their default; this is a control-loop internal. Rename before both ship in the same protocol. |
| Telemetry Interval | `250` ms | scalar | BLE telemetry notify cadence |
| Sensor Calibration | `Vmin=0.2, Vmax=2.7, Pmax_kPa=100.0` | `{Vmin, Vmax, Pmax_kPa}` | Voltage→pressure conversion curve for the analog sensors |
| Valve/Pump Timing | `phaseTick=30ms, reliefVent=1000ms, startupSettle=150ms` | `{phaseTick, reliefVent, startupSettle}` | Control-loop/valve actuation timing — currently unnamed literals inside `pneumatics.ino`, not even in `config.h` yet |

**Access**

| Variable | Read/Write | Storage | Changed Via | Status |
|---|---|---|---|---|
| Pressure Tolerance | R/W | `ESP-CONST` (plain mutable global) | Reflash only today | 🆕 low-effort to expose — already not `const` |
| Actuation Threshold | R/W | `ESP-CONST` (plain mutable global) | Reflash only today | 🆕 low-effort to expose — already not `const`, but rename first |
| Telemetry Interval | R/W | `ESP-CONST` (`#define`, not a variable) | Reflash only today | 🆕 needs converting from `#define` to a real variable first |
| Sensor Calibration | R/W, **service/calibration tier only** | `ESP-CONST` (`const float`) | Reflash only today | 🆕 higher risk — wrong values corrupt every pressure reading; removing `const` is a bigger, riskier change |
| Valve/Pump Timing | — | Hardcoded literals, not named | Reflash only | 🆕 first step is just naming these in `config.h`; whether to expose externally is a separate later decision |

---

## DIAGNOSTICS

**Definition**

| Variable | Default | Structure | Description |
|---|---|---|---|
| Valves Diagnostics | `(OFF,OFF,OFF,OFF)` | `[FRONT, TEMPLE, EAR, BACK]` | Live valve open/closed state |
| Manifold Diagnostics | `(OFF,ON)` | `[PUMP, RELIEF]` | Live pump/relief valve state |

**Access**

| Variable | Read/Write | Storage | Changed Via | Status |
|---|---|---|---|---|
| Valves Diagnostics | Read-only | `ESP-RAM` | System | 🔧 |
| Manifold Diagnostics | Read-only | `ESP-RAM` | System | 🔧 |

---

## VIBRATION

**Definition**

| Variable | Default | Structure | Description |
|---|---|---|---|
| Vibration Levels | `(0,85,170,255)` | `[LEVEL_0, LEVEL_1, LEVEL_2, LEVEL_3]` PWM | Output PWM per level 0–3 |
| Vibration Channels | `(0,0,0,0)` | `[FRONT, TEMPLE, EAR, BACK]` level 0–3 | Live vibration level per channel |
| Vibration Duration Time | `20` sec | scalar | Auto-off duration after vibration starts |
| Vibration Time per channel | `(0,0,0,0)` | `[FRONT, TEMPLE, EAR, BACK]` sec | Elapsed time since vibration started |

**Access**

| Variable | Read/Write | Storage | Changed Via | Status |
|---|---|---|---|---|
| Vibration Levels | R/W *(open question)* | `ESP-CONST` | Reflash only | ✅ (as `vibPWM[4]`) |
| Vibration Channels | R/W | `ESP-RAM` | Serial, BLE, WiFi *(planned)* | ✅ (as `vibrationLevel[4]`) |
| Vibration Duration Time | R/W | `ESP-CONST` | Reflash only | ✅ (values now match, `20000`ms / 20s) |
| Vibration Time per channel | Read-only | `ESP-RAM` | System (derived from `vibStartTime[]`) | 🔧 not exposed yet |

---

## USER DATA

**Definition**

| Variable | Default | Structure | Description |
|---|---|---|---|
| Session Time | `HH:MM:SS` | duration | Elapsed time in current session |
| Start time | — | timestamp | Wall-clock time session began |
| User Data | — | `{First_Name, Last_Name, ID, Age, treatment_protocol, treatment_num_session}` | Patient identity & treatment metadata |
| Session Operation Stage | `IDLE` | enum `IDLE / PRESSURIZING / MAINTENANCE / EMERGENCY_RELIEF / STOPPED` | Gates which controls the UI allows |
| User ID | — | scalar, opaque | Identifies who's checked out to this pouch |
| Assigned | `false` | bool | Whether this pouch has a live user record |

**Access**

| Variable | Read/Write | Storage | Changed Via | Status |
|---|---|---|---|---|
| Session Time | Read-only | `ESP-RAM` (elapsed ms), rendered as clock time by Console/POUCH_APP | System | ❗ ESP32 has no RTC, only relative `millis()` |
| Start time | R/W | Not on ESP — timestamped by Console UI / POUCH_APP UI | Console UI / POUCH_APP UI | ❗ same RTC gap |
| User Data | R/W | `APP-JSON` only | POUCH_APP UI | 🔧 never sent to ESP32 |
| Session Operation Stage | via actions, not direct set | `ESP-RAM` | Serial `s`/`r`/`emergency`; BLE `0x00`,`0x03`–`0x06` | ✅ this **is** `currentState` |
| User ID | R/W | `ESP-NVS` + `APP-JSON` | Assignment command | 🔧 |
| Assigned | R/W | `ESP-NVS` | System — set on assignment, cleared by future Clear/Reset | 🔧 |

---

## DEVICES

**Definition**

| Variable | Structure | Description |
|---|---|---|
| CONSOLE | `{Console_ID, connected, battery_charge, protocol[wifi\|bt\|serial], software_version, hardware_version}` | Console device's own identity/status |
| POUCH | `{POUCH_ID, connected, battery_charge, protocol, software_version, hardware_version}` | This physical pouch's own identity/status |

**Access**

| Variable | Read/Write | Storage | Changed Via | Status |
|---|---|---|---|---|
| CONSOLE | R/W | `CONSOLE-LOCAL`, optionally reported to `APP-JSON` | Console UI / System | 🔧 doesn't need to route through ESP32 |
| POUCH | R/W | `ESP-CONST` (ID/versions) + `ESP-RAM` (battery, if measured) | System | ❗ `POUCH_ID` ≠ `userId` (device identity vs. checked-out user); battery already stubbed at 0, no fuel gauge wired up |

---

## FIRMWARE-ONLY (intentionally not exposed)

Audited alongside the candidates above — these stay compile-time-only, on purpose.

| Variable | Why it stays firmware-only |
|---|---|
| `overSampling`, `overSamplingDelay`, `sensorDelayMeasur` | Sensor noise-filtering internals — no operational reason to expose; real risk of breaking pressure readings if mistuned |
| `valvePins[6]`, `analogPressureSensorPins[5]`, `vibrationPins[4]`, `MCP3008_CS` | Physical wiring, fixed per board revision |
| Serial baud rate (`9600`), `analogReadResolution(12)` | Low-level link/ADC init — chicken-and-egg to change over the same channel they configure |
| `NUM_SENSORS`, `NUM_FSR`, `PUMP_SENSOR` | Architecturally fixed to the physical channel count, not a tuning value |

---

## Open items to reconcile

- **Default Target Pressure** and **Vibration Levels** are compile-time constants today — decide if they should become admin-writable (fleet-wide push from POUCH_APP) or stay reflash-only.
- **RTC gap** — no real-time clock on the ESP32 (no WiFi/NTP, no RTC module). Session/Start time must be handled by CONSOLE or POUCH_APP.
- **`POUCH_ID` scheme** — not yet defined (factory constant? derived from MAC?).
- **Clear/Hard-reset scope** — deferred design. Should back up to POUCH_APP before wiping if reachable; behavior when unreachable is undecided.
- **Pressure Threshold enforcement** — not implemented anywhere yet; any command can currently set Current Target Pressure to any value with no bounds-check against Default.
- **Naming collision** — `PRESSURE_ACTUATION_THRESHOLD_MMHG` (Control Loop Tuning) vs. "Pressure Threshold" (Pneumatics) are different concepts that sound the same. Rename one before both exist in the shipped protocol.
- **Sensor Calibration access tier** — likely needs a stricter "service/calibration" role, not general admin, since a bad value corrupts every pressure reading fleet-wide if pushed carelessly.
- **Valve/Pump Timing** — decide whether these get exposed externally at all, or just formalized as named `config.h` constants and left reflash-only.

## New commands needed (not yet in `serial.ino` / `ble.ino`)

- **Save as default** — current → this user's `ESP-NVS` record (propagates to `APP-JSON` when reachable)
- **Assign new user** — blank pouch seeds a fresh NVS record from global defaults; works fully offline
- **Assign returning user (restore from archive)** — POUCH_APP pushes an archived record to a blank pouch; requires POUCH_APP connectivity
- **Clear / hard reset** — wipes `userId` + both defaults + `assigned` flag (design deferred)
- **Set threshold** — admin-only write to `pressureThreshold[4]`
