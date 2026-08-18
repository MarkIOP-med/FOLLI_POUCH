# FOLLISAVE Communication & Data API

Shared description of every variable that moves between **POUCH** (ESP32 firmware), **CONSOLE**
(patient-facing BLE client), and **POUCH_APP / POUCH_DIAGNOSTICS** (admin tablet/PC, the full
multi-user database). This is the target design — edit this file as the API evolves. It does
not always match what's currently implemented; check the **Status** column.

## Architecture in three bullets

- **POUCH (ESP32)** is the driver. Live session state and the checked-out user's pressure
  regime both live in RAM only — **not durable across a power-cycle today**, by deliberate
  choice (see "Open items"). One user per device at a time — a future clear/hard-reset wipes
  the record, same as a reboot already does.
- **CONSOLE** is a thin relay/display. It reads and writes through POUCH and holds no
  authoritative data of its own.
- **POUCH_APP (POUCH_DIAGNOSTICS)** holds the full archive — every user ever assigned to any
  pouch, their identity, and a backup copy of their pressure regime, so nothing is lost if a
  pouch is reassigned and later handed back to a previous user.

> **Ownership rule:** for any given user, exactly one side is "live" at a time — POUCH while
> they're checked out to it, POUCH_APP's archive while they're not. No field is ever written
> from two places at once.

### Three data tiers

Every variable in this doc falls into exactly one of these. This is a different split from
CORE/PERIPHERAL (which is about which `.ino` file may touch a variable in code) — this one is
about who the value belongs to and how long it lives.

- **Per-user** (`ESP-RAM` currently — durable `ESP-NVS` storage deferred, see "Open items") —
  the *only* user-specific data that lives on the pouch: `userId`, **User Default Pressure**,
  and the `assigned` flag. If no user is checked out ("default user"), User Default Pressure
  is just equal to the global Default Pressure Regime. Being RAM-only means all three reset
  on every power-cycle/reflash — the pouch "forgets" its assigned user each time it reboots.
- **System-wide** (`ESP-RAM`/`ESP-CONST`, same for every user, not tied to any `userId`) —
  Default Pressure Regime, Pressure Threshold, Vibration Duration, Vibration PWM levels, and
  everything in Control Loop Tuning. These can be live-changed by a command today; *durably*
  saving a changed value as the new system default (surviving reboot) is future work.
- **Per-session** (`ESP-RAM`, no persistence at all — gone on power-cycle or new session) —
  Current Target Pressure (seeded from User Default Pressure, tweakable within Pressure
  Threshold) and Vibration Channels. Vibration has no per-user saved default — only the
  system-wide duration/PWM levels persist as constants; the live level itself never does.

---

## Quick index

| Variable | Group | Status |
|---|---|---|
| Actual Pressure | Pneumatics | ✅ Implemented |
| FSR Pressure | Pneumatics | ✅ Implemented |
| Default Target Pressure | Pneumatics | ✅ Implemented (constant) |
| Default User Target Pressure | Pneumatics | ✅ Implemented (Save-as-default), RAM only; 🔧 durable NVS storage + APP-JSON mirror still planned |
| Current User Target Pressure | Pneumatics | ✅ Implemented |
| Pressure Threshold | Pneumatics | 🆕 Candidate — system-wide, not per-user |
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
| User ID | User Data | ✅ Implemented (ESP), RAM only; 🔧 durable NVS storage + APP-JSON mirror still planned |
| Assigned | User Data | ✅ Implemented, RAM only |
| CONSOLE device info | Devices | 🔧 Planned |
| POUCH device info | Devices | ❗ Gap / 🔧 Planned |

---

## Legend

**Storage**
- `ESP-RAM` — ESP32 RAM, live session value, lost on power-cycle
- `ESP-NVS` — ESP32 flash (`Preferences`), persists — **not currently used**; the per-user record is RAM-only today by deliberate choice, this is reserved for if/when durability is added back
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
| Default User Target Pressure | `(25,120,85,130)` | `[FRONT, TEMPLE, EAR, BACK]` mmHg | This user's saved regime, loaded at session start. Equals Default Target Pressure (global) if no user is currently assigned. **This is the only per-user field on the pouch.** |
| Current User Target Pressure | `(25,120,85,130)` | `[FRONT, TEMPLE, EAR, BACK]` mmHg | Live in-session target — per session only, not saved anywhere by default |
| Pressure Threshold | `(5,15,10,15)` | `[FRONT, TEMPLE, EAR, BACK]` mmHg | Max drift of Current from Default, per channel — **system-wide, same for every user**, not stored per-user |

**Access**

| Variable | Read/Write | Storage | Changed Via | Status |
|---|---|---|---|---|
| Actual Pressure | Read-only | `ESP-RAM` | System | ✅ |
| FSR Pressure | Read-only | `ESP-RAM` | System | ✅ (L/R mapping unconfirmed) |
| Default Target Pressure | R/W *(open question)* | `ESP-CONST`, system-wide | Reflash only | ✅ (values now match, `{25,120,85,130}`) |
| Default User Target Pressure | R/W | `ESP-RAM` (per-user, not durable) + `APP-JSON` mirror (planned) | Save-as-default (serial `save`, BLE `0x07`); Restore-from-archive | ✅ Save-as-default implemented, RAM only; 🔧 durable NVS storage + Restore-from-archive (APP-JSON sync) still planned |
| Current User Target Pressure | R/W | `ESP-RAM`, per session | Serial, BLE, WiFi *(planned)* | ✅ |
| Pressure Threshold | R/W, **admin only** | `ESP-RAM`, system-wide (not per-user) | Serial/BLE/WiFi, admin-gated | 🆕 Candidate — not enforced yet; durable system-default persistence deferred |

---

## CONTROL LOOP TUNING

Candidates identified while auditing the rest of `config.h`/the `.ino` files for values that
are currently hardcoded but might reasonably need tuning without a reflash. None of these are
decided yet — see "Open items" below. All of these are **system-wide** tier (see "Three data
tiers" above) — same for every user, never stored per-user. So are Pressure Threshold
(Pneumatics) and Vibration Duration / Vibration Levels (Vibration), listed in their own
sections below for context but conceptually part of this same bucket.

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
| Vibration Levels | `(0,85,170,255)` | `[LEVEL_0, LEVEL_1, LEVEL_2, LEVEL_3]` PWM | Output PWM per level 0–3 — **system-wide**, same for every user |
| Vibration Channels | `(0,0,0,0)` | `[FRONT, TEMPLE, EAR, BACK]` level 0–3 | Live vibration level per channel — **per session only, no per-user saved default** |
| Vibration Duration Time | `20` sec | scalar | Auto-off duration after vibration starts — **system-wide**, same for every user |
| Vibration Time per channel | `(0,0,0,0)` | `[FRONT, TEMPLE, EAR, BACK]` sec | Elapsed time since vibration started |

**Access**

| Variable | Read/Write | Storage | Changed Via | Status |
|---|---|---|---|---|
| Vibration Levels | R/W *(open question)* | `ESP-CONST`, system-wide | Reflash only | ✅ implemented as `vibPWM[4]`; 🆕 candidate for live command-change (durable persistence deferred) |
| Vibration Channels | R/W | `ESP-RAM`, per session | Serial, BLE, WiFi *(planned)* | ✅ (as `vibrationLevel[4]`) |
| Vibration Duration Time | R/W | `ESP-CONST`, system-wide | Reflash only | ✅ implemented, `20000`ms / 20s; 🆕 candidate for live command-change (durable persistence deferred) |
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
| User ID | R/W | `ESP-RAM` (not durable) + `APP-JSON` (planned) | Assign-new-user (serial `assign`, BLE `0x08`) | ✅ ESP side implemented, RAM only; 🔧 durable NVS storage + APP-JSON sync still planned |
| Assigned | R/W | `ESP-RAM` (not durable) | System — set by Assign-new-user, cleared by future Clear/Reset (or a reboot, today) | ✅ set/read implemented, RAM only |

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
- **Pressure Threshold enforcement** — not implemented anywhere yet; any command can currently set Current Target Pressure to any value with no bounds-check against Default. Now confirmed system-wide (not per-user).
- **Naming collision** — `PRESSURE_ACTUATION_THRESHOLD_MMHG` (Control Loop Tuning) vs. "Pressure Threshold" (Pneumatics) are different concepts that sound the same. Rename one before both exist in the shipped protocol.
- **Sensor Calibration access tier** — likely needs a stricter "service/calibration" role, not general admin, since a bad value corrupts every pressure reading fleet-wide if pushed carelessly.
- **Valve/Pump Timing** — decide whether these get exposed externally at all, or just formalized as named `config.h` constants and left reflash-only.
- **Per-user persistence deferred** — `userId`/`assigned`/User Default Pressure are RAM-only by deliberate choice (not a bug): the pouch forgets its assigned user on every power-cycle or reflash. NVS/`Preferences`-backed durability was implemented once and deliberately removed in favor of simplicity while this is still being built out; re-add it later if the pouch needs to remember its user across a reboot.

## Commands

Implemented, both transports:

- **Save as default** (serial `save`, BLE mode `0x07`) — current *pressure* → this user's saved-default record, RAM only. Pressure only — vibration has no per-user default to save. Does not touch `userId`/`assigned`. Lost on power-cycle; `APP-JSON` sync (so POUCH_APP's archive picks up the change) is not wired up yet either.
- **Assign new user** (serial `assign`, BLE mode `0x08`) — assigns a fresh `userId` to this pouch (counter resets each boot, so ids can repeat across power-cycles), resets `savedPressure[]` to the global Default Pressure Regime. RAM only. Works fully offline.

Still needed:

- **Assign returning user (restore from archive)** — POUCH_APP pushes an archived pressure record to a blank pouch; requires POUCH_APP connectivity
- **Clear / hard reset** — wipes `userId` + User Default Pressure + `assigned` flag (design deferred)
- **Set system parameter** (admin/service-gated, deferred) — live-update a system-wide value (Pressure Threshold, Vibration Duration/Levels, or any Control Loop Tuning constant) via command. Takes effect immediately in RAM; persisting the change as the new durable system default across reboots is future work.
