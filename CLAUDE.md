# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

FOLLI_POUCH ("FOLLISAVE") is a pneumatic headband pressure controller. The repo has four parts:

- **`POUCH_ESP_GEN4/`** — current-generation Arduino/ESP firmware (active development target).
- **`POUCH_APP/`** — a Flask + vanilla JS web dashboard that talks to the firmware over USB serial.
- **`FOLLI_CONSOLE/`** — the patient-facing Android kiosk app (React Native / Expo, TypeScript). Talks to the pouch over BLE per `FOLLI_CONSOLE/FOLLI_COMSOLE_OVERVIEW.md`; has its own `package.json` and jest suite.
- **`LEGACY_ARDUINO/`** — superseded firmware generations (Gen1–Gen3, plus unrelated older `kasda*` sensor-calibration sketches). Kept for reference only; do not modify unless explicitly asked to port something forward.

Outside `FOLLI_CONSOLE/` there is no build system, package.json, or test suite — firmware is compiled/flashed via the Arduino IDE (`.ino` + `config.h`), and the web app is run directly with Python.

**BLE protocol:** `POUCH_ESP_GEN4/ble.ino` implements a NimBLE GATT server matching `FOLLI_CONSOLE/FOLLI_COMSOLE_OVERVIEW.md` (4-byte commands / 6-byte telemetry, service `4fafc201-…`), extended with opcodes `0x03`-`0x06` (restore/reset/device on-off) that the original doc didn't cover — see that doc's Section 3 and `ble.ino` for the full mapping. The firmware still speaks the USB-serial text protocol below in parallel.

## Running things

**Web dashboard** (from `POUCH_APP/`):
```bash
pip install -r requirements.txt
python app.py
```
Serial port is hardcoded at `app.py:19` (`SERIAL_PORT = "COM3"`) — update it to match the actual device port before running. Server listens on `0.0.0.0:5000` and auto-connects to serial on startup; if that fails it still serves the UI and you can connect manually via `/api/connect`.

**Firmware**: open `POUCH_ESP_GEN4/POUCH_ESP_GEN4.ino` in the Arduino IDE (needs the `NimBLE-Arduino` library; `SPI` is built in) and flash to the ESP32. Serial monitor / dashboard must use 9600 baud. Targets an ESP32 board — no keyboard, LEDs, or OLED on this hardware revision; the Adafruit display/NeoPixel libraries are no longer needed.

**Console app** (from `FOLLI_CONSOLE/`, needs Node 20+):
```bash
npm install
npx expo start --web   # fastest look: runs in browser against a mock BLE pouch
npm test               # jest suite (codec, viewmodel, screens, kiosk)
npx expo run:android   # real device build (needs JDK 17 + Android SDK + USB debugging)
```
Android kiosk lock-task setup and the `android/` regeneration caveat are documented in `FOLLI_CONSOLE/native/android/README_KIOSK.md`.

## Firmware architecture (`POUCH_ESP_GEN4/`)

One `.ino` per responsibility, all sharing state declared in `config.h` (pins, tuning constants, enums, globals, forward declarations — read this file first when touching firmware). Arduino requires every `.ino` to sit flat in the sketch root (no subfolders get auto-compiled), so the CORE/PERIPHERAL split below is enforced by convention + `config.h`'s layout, not by directory structure:

**CORE** — the pressure control loop: get each V_NODE's actual pressure to its target. Owns the valve/pump/relief pins and the channel state machine; nothing outside these two files may drive `valvePins`/`PUMP_PIN`/`RELIEF_PIN` or touch the channel-state statics directly.

| File | Responsibility |
|---|---|
| `pneumatics.ino` | Valve/pump/relief init, non-blocking state machine driving channels to target pressure |
| `analogSensor.ino` | Oversampled analog pressure sensor reads + reference-pressure capture |

**PERIPHERAL** — decides *what* the targets should be, or reads/actuates hardware the pressure loop doesn't need. Serial and BLE parse their own wire format but never mutate control state directly — they build a `Command` (`config.h`) and call `enqueueCommand()`; `commandQueue.ino` is the one place that applies it, on the main loop thread — they never touch pins CORE owns.

| File | Responsibility |
|---|---|
| `serial.ino` | Serial command parsing → enqueues `Command`s; CSV telemetry logging |
| `ble.ino` | NimBLE GATT server — command channel parses → enqueues `Command`s; telemetry notify, see protocol note above |
| `commandQueue.ino` | Central command queue + dispatcher — every transport enqueues here instead of mutating `targetPressure[]`/`vibrationLevel[]`/`currentState`/etc. directly, so BLE's callback (which runs in NimBLE's own FreeRTOS task) can't race the control loop |
| `userProfile.ino` | Per-user record (`userId`, `assigned`, `savedPressure[]`) — RAM only, not durable across power-cycle; one record per device, reset at startup, updated on Save-as-default/Assign-new-user/Reset |
| `vibration.ino` | Vibration motor level control with auto-timeout |
| `fsr.ino` | 8-channel FSR read via MCP3008 SPI ADC (2 FLOW_LINK connectors × 4 V_NODEs) |

| File | Responsibility |
|---|---|
| `POUCH_ESP_GEN4.ino` | `setup()` / `loop()` only |
| `config.h` | Pins, tuning params, globals, enums, function declarations — grouped under `CORE`/`CORE CONTROL STATE`/`PERIPHERAL` headers matching this split |

No keyboard/LEDs/display files — this hardware revision has none; all control/status that used to live on the physical control unit now goes through `ble.ino`.

`loop()` order matters: CORE senses pressure → PERIPHERAL reads FSR/logs/parses serial into the command queue, then `processCommandQueue()` drains it (this tick's serial input plus any BLE writes queued since the last drain) → CORE's state machine drives toward the (possibly just-updated) targets → PERIPHERAL applies vibration + pushes BLE telemetry.

**Pneumatic topology**: one pump feeds a shared manifold; each of 4 V_NODEs (FRONT/TEMPLE/EAR/BACK) has its own solenoid valve to the manifold and its own downstream pressure sensor; a single relief valve vents the manifold to atmosphere. Increasing a PAD = open its valve + run pump; decreasing = open its valve + relief simultaneously; emergency/STOP = open all 4 valves + relief. Each V_NODE also has a vibration motor (coupled L/R pair, one GPIO) and, via the two FLOW_LINK connectors to the headband, an FSR force sensor per side.

**State machine** (`SystemState`): `IDLE → PRESSURIZING → MAINTENANCE`, or `EMERGENCY_RELIEF` / `STOPPED` from anywhere. `updateChannels()` in `pneumatics.ino` is non-blocking — it advances one channel/phase per `loop()` iteration rather than blocking with `delay()`.

**Serial protocol** (parsed in `serial.ino`, mirrored by `POUCH_APP/app.py`):
- `X,Y` — set channel X (0–3) target to Y mmHg
- `X1,Y1;X2,Y2;...` — batch set multiple channels
- `s` — stop
- `r` / `emergency` — emergency relief, all PADs vent
- `vib:L0,L1,L2,L3` — set vibration levels per channel (0–3)
- `save` — save current pressures as this user's saved default (RAM only)
- `assign` — assign a fresh user to this pouch, works fully offline
- `restore` / `reset` — recall saved / factory-default pressures
- `on` / `off` — device on / device off
- Outbound telemetry is a CSV line per loop: `time,FRN_T,FRN_A,TMP_T,TMP_A,EAR_T,EAR_A,BCK_T,BCK_A,MAN,FSR0,FSR1,FSR2,FSR3,FSR4,FSR5,FSR6,FSR7` (all 8 FSR channels are real MCP3008 reads now; which channel maps to which FLOW_LINK side/PAD isn't confirmed against the harness yet — see the TODO in `config.h`).

None of `serial.ino`'s commands beyond the original four (`X,Y`, `s`, `r`/`emergency`, `vib:`) are mirrored by `POUCH_APP/app.py` yet — that's a separate app-side task, not done as part of the firmware work described above.

`POUCH_GEN4_ARCHITECTURE.md` has since been rewritten against the current firmware (it now calls itself "Gen6" internally, reflecting a later rename) and matches the `.ino`/`config.h` files closely — pins, loop order, state machine, BLE opcodes, and function lists all check out. It still verifies against the code, not the other way around, so when editing firmware prefer the actual `.ino` files as ground truth and update the doc alongside any behavioral change.

## Web app architecture (`POUCH_APP/`)

`app.py` is a single-file Flask backend:
- `SerialManager` owns the pyserial connection and a background reader thread (`_read_loop`) that parses telemetry CSV lines and pushes them into `device_state["last_telemetry"]` plus a bounded `Queue`.
- Command endpoints (`/api/commands/start|stop|emergency|vibration`) build a protocol string and funnel through `send_command_helper` → `SerialManager.send_command`.
- `/api/command` accepts a raw protocol string, validated by `_validate_command` (permissive — checks shape, not full grammar).
- Telemetry is polled by the frontend via `/api/telemetry`, not pushed (no WebSocket yet).
- Static frontend (`static/index.html` + `app.js` + `style.css`) mirrors the SVG mockup in `gui_mockups/`.

When adding a new device command, it must be added in three places to stay consistent: the firmware parser (`POUCH_ESP_GEN4/serial.ino`), `_validate_command` in `app.py`, and a corresponding `/api/commands/*` route + frontend control.