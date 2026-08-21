# POUCH_ESP — FOLLISAVE Firmware Reference

ESP32 firmware for the FOLLISAVE pneumatic headband pressure controller. This hardware
revision has no physical controls (no keyboard, LEDs, or display) — everything is driven
over **Serial** (USB, used by `POUCH_APP`) or **BLE** (used by `CONSOLE`), which speak an
identical command grammar in both directions.

## Contents

1. [System Overview](#1-system-overview)
2. [Firmware Structure](#2-firmware-structure)
3. [Pneumatic & Sensor Hardware](#3-pneumatic--sensor-hardware)
4. [State Machine](#4-state-machine)
5. [Data Model](#5-data-model)
6. [Communication Protocol](#6-communication-protocol)
7. [Command Reference](#7-command-reference)
8. [Response Format](#8-response-format)
9. [Known Limitations](#9-known-limitations)

---

## 1. System Overview

- **POUCH (this firmware, ESP32)** — the driver. Runs the pressure control loop, holds
  live session state, and holds the pressure regime of whichever single user is
  currently checked out to it.
- **CONSOLE** — the patient-facing BLE client. Reads and writes through POUCH; holds no
  authoritative data of its own.
- **POUCH_APP / POUCH_DIAGNOSTICS** — the admin tablet/PC app, connected over USB
  serial. Holds the full multi-user archive (identity, treatment data, and a backup copy
  of each user's pressure regime).

One physical pouch serves one user at a time. `RESET ALL` (§7) clears the assignment.

---

## 2. Firmware Structure

One `.ino` file per responsibility, sharing state declared in `config.h`. Split into
**CORE** (owns the valve/pump/relief pins and the channel state machine — nothing
outside these two files may drive them directly) and **PERIPHERAL** (decides what the
targets should be; only ever writes to shared control state, never touches pins).

| File | Group | Responsibility |
|---|---|---|
| `POUCH_ESP_GEN4.ino` | — | `setup()` / `loop()` only |
| `config.h` | — | Pins, tuning constants, global state, enums, the `Command` struct, function declarations |
| `pneumatics.ino` | CORE | Valve/pump/relief init, non-blocking state machine driving channels to target pressure |
| `analogSensor.ino` | CORE | Oversampled analog pressure sensor reads, reference-pressure capture |
| `commandQueue.ino` | PERIPHERAL | Central command queue and dispatcher — every transport enqueues here instead of mutating state directly; sends all responses |
| `commandParser.ino` | PERIPHERAL | Shared text-command grammar, used identically by Serial and BLE |
| `userProfile.ino` | PERIPHERAL | The checked-out user's record (RAM only — see §5) |
| `serial.ino` | PERIPHERAL | Serial I/O — reads lines, hands them to the parser; periodic CSV telemetry |
| `ble.ino` | PERIPHERAL | NimBLE GATT server — command characteristic hands writes to the parser; telemetry characteristic carries text responses |
| `vibration.ino` | PERIPHERAL | Vibration motor level control with auto-timeout |
| `fsr.ino` | PERIPHERAL | 8-channel force-sensor read via MCP3008 SPI ADC |

**Loop order:** sense pressure (CORE) → read FSR, log, parse incoming commands into the
queue, drain the queue (PERIPHERAL) → drive toward the (possibly just-updated) targets
(CORE) → apply vibration, push telemetry (PERIPHERAL). Draining the command queue
happens on the main loop thread, once per tick, right before the control loop runs —
this is what lets Serial and BLE (which parses on NimBLE's own FreeRTOS task) share
state safely without racing each other.

**Startup sequence:** `Serial.begin(9600)` → `analogReadResolution(12)` →
`initValves()` → `initCommandQueue()` → `initUserProfile()` → `initVibration()` →
`initFSR()` → `initBLE()` → vent to atmosphere → 500ms settle → capture reference
pressure → `currentState = IDLE`.

---

## 3. Pneumatic & Sensor Hardware

```
         [PUMP]
            |
         [MANIFOLD] ──── [Manifold Pressure Sensor]  GPIO32
            |
     ┌──────┼──────┬──────────┐
  valve[0] valve[1] valve[2] valve[3]     [RELIEF] → atmosphere
     |       |       |       |
   FRONT   TEMPLE   EAR     BACK
  (GPIO33) (GPIO34) (GPIO35) (GPIO36)
```

One pump feeds a shared manifold; each of 4 V_NODEs (FRONT/TEMPLE/EAR/BACK) has its own
solenoid valve to the manifold and its own downstream pressure sensor; a single relief
valve vents the manifold to atmosphere. Each V_NODE also has a vibration motor (coupled
L/R pair, one GPIO) and, via two FLOW_LINK connectors, a force sensor per side (8
channels total, read over SPI from an MCP3008 ADC).

**Pressure control:** increase a PAD by opening its valve and running the pump
together; decrease by opening its valve and the relief valve together; a full vent
opens all 4 valves and relief simultaneously. A full vent (STOP/START/RESTART/RESET)
is PULSED: burst (`RELIEF_VENT_DURATION_MS`) → valves closed → settle
(`VENT_SETTLE_MS`) → measure, repeated until every pad reads ≤ `VENT_COMPLETE_MMHG`
with the valves closed, bounded by `RELIEF_VENT_TIMEOUT_MS`. Pad sensors cannot see
the load's pressure while the vent path is open (the sensor line empties instantly;
a high-volume load drains slowly), so only settled readings count — a fixed 1s vent
left bench balloons at 125 mmHg visibly inflated after STOP, and the subsequent
reference capture then hid their real pressure. The vent blocks the loop while it
runs (worst case ~15s).

| Pins | Values |
|---|---|
| Valves (FRONT/TEMPLE/EAR/BACK) | GPIO 26, 4, 13, 14 |
| Relief valve | GPIO 25 |
| Pump | GPIO 27 |
| Pressure sensors (FRONT/TEMPLE/EAR/BACK/Manifold) | GPIO 33, 34, 35, 36, 32 — verified against the physical harness on the balloon bench 2026-08-20; the manifold sensor is on GPIO32, not GPIO36 |
| Vibration motors (FRONT/TEMPLE/EAR/BACK) | GPIO 16, 17, 21, 22 |
| MCP3008 chip-select (FSR) | GPIO 5 |

`analogPressureSensorPins[]` and `valvePins[]` share the same convention: the 4 named
channels first, the manifold/pump-equivalent entry last (index 4 for sensors via
`PUMP_SENSOR`, indices 4–5 for valves via `RELIEF_PIN`/`PUMP_PIN`).

Sensor conversion: 3.3V supply, 0.2–2.7V maps to 0–100kPa, converted to mmHg.
FSR channel-to-connector/side mapping is not yet confirmed against the physical
harness — data is read in raw MCP3008 channel order (0–7).

---

## 4. State Machine

```
IDLE → PRESSURIZING → MAINTENANCE
  ↑___________________________|
EMERGENCY_RELIEF / STOPPED — reachable from any state
```

- **IDLE** — no active target, valves closed.
- **PRESSURIZING** — actively driving one or more channels toward their targets.
- **MAINTENANCE** — all channels have reached target; the loop keeps cycling through
  them to hold pressure against drift.
- **EMERGENCY_RELIEF** — transient: the control loop vents everything, then returns to
  IDLE the same tick.
- **STOPPED** — full halt; the control loop does nothing until a command moves it out.

The channel-servicing loop (`updateChannels()`) is non-blocking — it advances one
channel/phase per `loop()` iteration rather than blocking with `delay()`.

---

## 5. Data Model

Every piece of state belongs to exactly one of three tiers, which determines who it
belongs to and how long it lives:

- **Per-session** (RAM, reset every session or power-cycle) — the live values a session
  actually runs on: current target pressure, current vibration level.
- **Per-user** (RAM only today — see §9) — the one checked-out user's identity and
  saved pressure regime. Not shared across users; a pouch holds exactly one record.
- **System-wide** (same for every user, not tied to any user) — factory defaults and
  control-loop tuning constants.

| Variable | Tier | Default | Description |
|---|---|---|---|
| `currentTargetPressure[4]` | Per-session | `{0,0,0,0}` | Live in-session pressure target, FRONT/TEMPLE/EAR/BACK |
| `vibrationLevel[4]` | Per-session | `{0,0,0,0}` | Live in-session vibration level per channel, 0–3 |
| `userId` | Per-user | `-1` | Opaque id of the checked-out user; `-1` = none |
| `assigned` | Per-user | `false` | Whether this pouch currently has a live user record |
| `userDefaultPressure[4]` | Per-user | — | This user's saved pressure regime |
| `systemDefaultPressure[4]` | System-wide | `{25,120,85,130}` | Factory default pressure, all users |
| `vibPWM[4]` | System-wide | `{0,85,170,255}` | PWM output per vibration level 0–3 |
| `PRESSURE_TOLERANCE_MMHG` | System-wide | `3` | ± dead-band for "at target" |
| `PRESSURE_ACTUATION_THRESHOLD_MMHG` | System-wide | `10` | Below this, a zero-target channel is skipped rather than actuated |
| `VIBRATION_DURATION_MS` | System-wide | `20000` | Vibration auto-off duration |
| `TELEMETRY_INTERVAL_MS` | System-wide | `250` | BLE telemetry push cadence |

**Read-only (sensor-derived, reported as telemetry, never written):**

| Variable | Description |
|---|---|
| `actualPressure[4]` | Measured pressure per channel |
| `actualManifoldPressure` | Measured manifold pressure — a single scalar, not part of the 4-channel vectors |
| `fsrData[8]` | Raw force-sensor reads |

The four system-wide tuning constants above are live-settable via `SET VARIABLE` (§7).
`systemDefaultPressure[4]` and `vibPWM[4]` are arrays and are not — they require a
reflash to change.

---

## 6. Communication Protocol

Serial and BLE parse the exact same text grammar and produce the exact same tagged
response format — there is no separate binary protocol on either transport or in
either direction.

**Grammar:** a bare lowercase word for commands with no payload, `command:payload` for
commands that take data, `;`-separated for the one command that batches (`SET
PRESSURE`).

**BLE specifics:** service `4fafc201-…`, command characteristic `beb5483e-…` (write),
telemetry characteristic `d68a2a54-…` (notify — carries text, both periodic telemetry
and on-demand responses). Commands longer than the default ~20-byte MTU need the client
to negotiate a larger MTU (NimBLE supports up to ~247 bytes) or use Write-With-Response
so the stack's long-write mechanism reassembles them. Notify payloads are equally
MTU-bound with no equivalent long-notify mechanism — a long response (`READ ALL`) can
be truncated without a negotiated MTU.

---

## 7. Command Reference

| Command | Syntax | Behavior |
|---|---|---|
| **START** | `start` | Vent → recapture reference → `currentTargetPressure[] = userDefaultPressure[]` → begin pressurizing |
| **STOP** | `stop` | Stop vibration, vent all channels to zero, return to idle |
| **RESET ALL** | `resetall` | Vent → all pressures (current, user default) reset to system default → user unassigned → begin pressurizing toward system default |
| **RESTART** | `restart` | Vent, recapture reference pressure, return to idle. Identity and saved regime untouched. |
| **USER_ID** | `user:<id>:<p0>,<p1>,<p2>,<p3>` | Load a specific known user: id + full pressure regime, supplied by the caller. Does not start pressurizing — follow with `START` to apply it. |
| **ASSIGN** | `assign` | Assign a fresh, locally-generated user to this pouch, seeded with system default pressure. Works fully offline. |
| **SET PRESSURE** | `setpressure:<p0>,<p1>,<p2>,<p3>` (all 4, positional) — or `setpressure:<channel>,<value>` (one channel; batch: `setpressure:0,80;3,120`) | Set live target pressure; begins pressurizing. The two forms are told apart by count — 4 numbers with no `;` is the positional vector, anything else is indexed pairs. |
| **SAVE AS DEFAULT** | `saveasdefault` | Save whatever's currently running as this user's saved default |
| **SET USER DEFAULT PRESSURE** | `setuserdefaultpressure:<p0>,<p1>,<p2>,<p3>` | Set this user's saved default directly, independent of the live session |
| **SET VIBRATION** | `setvibration:<L0>,<L1>,<L2>,<L3>` | Set vibration level per channel (0–3); auto-off after `VIBRATION_DURATION_MS`. `-1` leaves that channel unchanged, so one zone can be (re)triggered without stopping the others. |
| **SET VARIABLE** | `setvariable:<NAME>,<VALUE>` (or `,default`) | Set one system-wide tuning constant, or reset it to its compiled default. Valid names: `PRESSURE_TOLERANCE`, `ACTUATION_THRESHOLD`, `VIBRATION_DURATION`, `TELEMETRY_INTERVAL`. |
| **READ PRESSURE** | `readpressure` | Actual pressure (4 channels + manifold) and current target (4 channels) |
| **READ FSR** | `readfsr` | All 8 raw force-sensor readings |
| **READ VARIABLES** | `readvariables` | The four `SET VARIABLE` constants and their current values |
| **READ USER** | `readuser` | `userId`, `assigned`, and the saved pressure regime |
| **READ STATE** | `readstate` | The current state machine value |
| **READ VIBRATION** | `readvibration` | Live vibration level per channel |
| **READ ALL** | `readall` | Everything above, concatenated in one response |

`ACTUATION_THRESHOLD` (a control-loop internal — how low a zero-target channel's actual
pressure must fall before it's skipped) is a distinct concept from a per-user pressure
adjustment threshold, which is not implemented (§9). Don't conflate the two.

---

## 8. Response Format

Every response — periodic telemetry, read results, and command acknowledgements — is a
single tagged line:

| Prefix | Meaning | Example |
|---|---|---|
| `T:` | Periodic telemetry, unprompted | `T:80,80,25,130,45` |
| `R:` | Response to a READ command | `R:STATE:PRESSURIZING` |
| `OK:` | A command succeeded | `OK:START` |
| `ERR:` | A command failed — bad syntax, out-of-range value, unknown command/variable | `ERR:SETPRESSURE:channel out of range (7)` |

**Routing:** every response is echoed on Serial regardless of origin. If the triggering
command came over BLE, the same line is additionally pushed through the telemetry
notify characteristic — that's the only way a BLE caller sees it.

**Telemetry verbosity differs by transport, deliberately.** Both lines carry the state
machine char (`I/P/M/E/S`) and the session-elapsed seconds (clock starts on the
transition into PRESSURIZING from any transport, stops on a full vent) — this is what
lets the serial admin app and the BLE console MIRROR each other's sessions.

- **Serial** (every `SERIAL_LOG_INTERVAL_MS`, 200ms):
  `T:time,FRN_T,FRN_A,TMP_T,TMP_A,EAR_T,EAR_A,BCK_T,BCK_A,MAN,FSR0..FSR7,STATE,ELAPSED`
  (20 fields; STATE/ELAPSED appended last so old parsers fail loudly on field count).
  It must never be printed every loop: at 9600 baud one CSV line takes ~130ms to ship,
  which throttles `loop()` to ~7Hz and makes the pump badly overshoot the manifold
  between pressure checks (bench-measured ~400 mmHg spikes before the fix, 2026-08-20).
- **BLE** (every `TELEMETRY_INTERVAL_MS`, 250ms):
  `T:<state>,<elapsed_s>,<a0>,<a1>,<a2>,<a3>,<t0>,<t1>,<t2>,<t3>,<batt>,<err>`
  (~55 bytes — the client MUST negotiate a larger MTU, the console requests 185; an
  un-negotiated 20-byte MTU truncates the line). Battery and error remain stubs. BLE's periodic `T:` line is lighter (4 actual pressures + battery + error
byte, pushed every `TELEMETRY_INTERVAL_MS`) — anything more detailed is available on
demand via the `READ` commands instead of being pushed continuously over a
bandwidth-constrained link.

---

## 9. Known Limitations

- **Valve paths 0 (FRONT) and 3 (BACK) have a physical fault** (bench finding
  2026-08-20): their solenoids click but air never reaches the load — balloons on those
  ports don't inflate, while channels 1 (TEMPLE) and 2 (EAR) work. Until the hardware is
  repaired, `systemDefaultPressure[]` keeps those two channels at 0 so the control loop
  skips them.
- **One FLOW_LINK side is electrically dead** (bench finding 2026-08-20): its vibration
  motors don't run and its four FSR channels (0–3) never respond, while the other side's
  motors and FSR channels 4–7 all work (~950/1023 on press). Since one GPIO drives each
  L/R motor pair, this is the harness/connector, not firmware. FSR channel→position
  mapping is still unconfirmed (config.h TODO stands) — map it once both sides respond.
- **No real-time clock.** The ESP32 has no RTC and no WiFi/NTP sync — only relative
  `millis()` since boot. Session start time and wall-clock timestamps must be tracked
  by CONSOLE or POUCH_APP, not the pouch.
- **Per-user data is RAM-only.** `userId`, `assigned`, and `userDefaultPressure[4]` do
  not survive a power-cycle or reflash — a pouch forgets its assigned user every time
  it restarts. This is deliberate for now, not a bug; durable storage can be added back
  to `userProfile.ino` later if needed.
- **No archive sync.** `USER_ID` is the mechanism for loading a returning user's
  regime, but nothing on the POUCH_APP side populates it from an archive yet — that's
  application-layer work, not firmware.
- **Pressure adjustment has no bounds-check.** `SET PRESSURE` accepts any value with no
  limit on how far it may drift from the user's saved default. A threshold concept for
  this is designed but not implemented.
- **Diagnostics not implemented.** Live valve/manifold open-closed state isn't tracked
  or exposed anywhere.
- **Device identity not implemented.** A `POUCH_ID` distinct from `userId` (this
  device's own identity vs. whichever user is checked out to it) is planned but has no
  defined scheme yet.
- **Sensor calibration and valve/pump timing constants are reflash-only.** Both are
  higher-risk to expose at runtime (a bad calibration value corrupts every pressure
  reading) and are deliberately excluded from `SET VARIABLE`.
- **`systemDefaultPressure[4]` and `vibPWM[4]` are reflash-only.** `SET VARIABLE` only
  covers scalar constants; changing these arrays requires a reflash.
