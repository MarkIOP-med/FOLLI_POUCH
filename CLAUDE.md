# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

FOLLI_POUCH ("FOLLISAVE") is a pneumatic headband pressure controller. The repo has four parts:

- **`POUCH_ESP_GEN4/`** — current-generation Arduino/ESP firmware (active development target).
- **`POUCH_APP/`** — a Flask + vanilla JS web dashboard that talks to the firmware over USB serial.
- **`FOLLI_CONSOLE/`** — the patient-facing Android kiosk app (React Native / Expo, TypeScript). Talks to the pouch over BLE per `FOLLI_CONSOLE/FOLLI_COMSOLE_OVERVIEW.md`; has its own `package.json` and jest suite.
- **`LEGACY_ARDUINO/`** — superseded firmware generations (Gen1–Gen3, plus unrelated older `kasda*` sensor-calibration sketches). Kept for reference only; do not modify unless explicitly asked to port something forward.

Outside `FOLLI_CONSOLE/` there is no build system, package.json, or test suite — firmware is compiled/flashed via the Arduino IDE (`.ino` + `config.h`), and the web app is run directly with Python.

**Protocol gap to know about:** the console app implements the BLE GATT protocol from `FOLLI_CONSOLE/FOLLI_COMSOLE_OVERVIEW.md` (4-byte commands / 6-byte telemetry, service `4fafc201-…`), but Gen4 firmware currently speaks only the USB-serial text protocol below — it has no BLE server. Until BLE is added to the firmware (or a serial transport to the app), the two cannot talk to each other.

## Running things

**Web dashboard** (from `POUCH_APP/`):
```bash
pip install -r requirements.txt
python app.py
```
Serial port is hardcoded at `app.py:19` (`SERIAL_PORT = "COM3"`) — update it to match the actual device port before running. Server listens on `0.0.0.0:5000` and auto-connects to serial on startup; if that fails it still serves the UI and you can connect manually via `/api/connect`.

**Firmware**: open `POUCH_ESP_GEN4/POUCH_ESP_GEN4.ino` in the Arduino IDE (needs `Adafruit_SH110X` and `Adafruit_NeoPixel` libraries) and flash to the Mega/ESP32. Serial monitor / dashboard must use 9600 baud.

**Console app** (from `FOLLI_CONSOLE/`, needs Node 20+):
```bash
npm install
npx expo start --web   # fastest look: runs in browser against a mock BLE pouch
npm test               # jest suite (codec, viewmodel, screens, kiosk)
npx expo run:android   # real device build (needs JDK 17 + Android SDK + USB debugging)
```
Android kiosk lock-task setup and the `android/` regeneration caveat are documented in `FOLLI_CONSOLE/native/android/README_KIOSK.md`.

## Firmware architecture (`POUCH_ESP_GEN4/`)

One `.ino` per responsibility, all sharing state declared in `config.h` (pins, tuning constants, enums, globals, forward declarations — read this file first when touching firmware):

| File | Responsibility |
|---|---|
| `POUCH_ESP_GEN4.ino` | `setup()` / `loop()` only |
| `config.h` | Pins, tuning params, globals, enums, function declarations |
| `pneumatics.ino` | Valve/pump/relief init, non-blocking state machine driving channels to target pressure |
| `analogSensor.ino` | Oversampled analog pressure sensor reads + reference-pressure capture |
| `display.ino` | SH1106G OLED init/update |
| `serial.ino` | Serial command parsing + CSV telemetry logging |
| `keyboard.ino` | 17-key debounced scan, key→action mapping, long-press detection |
| `leds.ino` | NeoPixel (8 LEDs) state-driven sync |
| `vibration.ino` | Vibration motor level control with auto-timeout |

`loop()` order matters: read sensors → update pressures → log telemetry → handle serial → handle keys → check long-press → run state machine → update vibration/LEDs/display.

**Pneumatic topology**: one pump feeds a shared manifold; each of 4 PADs (FRONT/TEMPLE/EAR/BACK) has its own solenoid valve to the manifold and its own downstream pressure sensor; a single relief valve vents the manifold to atmosphere. Increasing a PAD = open its valve + run pump; decreasing = open its valve + relief simultaneously; emergency/STOP = open all 4 valves + relief.

**State machine** (`SystemState`): `IDLE → PRESSURIZING → MAINTENANCE`, or `EMERGENCY_RELIEF` / `STOPPED` from anywhere. `updateChannels()` in `pneumatics.ino` is non-blocking — it advances one channel/phase per `loop()` iteration rather than blocking with `delay()`.

**Serial protocol** (parsed in `serial.ino`, mirrored by `POUCH_APP/app.py`):
- `X,Y` — set channel X (0–3) target to Y mmHg
- `X1,Y1;X2,Y2;...` — batch set multiple channels
- `s` — stop
- `r` / `emergency` — emergency relief, all PADs vent
- `vib:L0,L1,L2,L3` — set vibration levels per channel (handled app-side; not yet parsed in `serial.ino`)
- Outbound telemetry is a CSV line per loop: `time,FRN_T,FRN_A,TMP_T,TMP_A,EAR_T,EAR_A,BCK_T,BCK_A,MAN,FSR_FRN_L,FSR_FRN_R,FSR_TMP_L,FSR_TMP_R,FSR_EAR_L,FSR_EAR_R,FSR_BCK_L,FSR_BCK_R` (EAR FSR channels are stubbed to 0 — not implemented in hardware yet).

Gen4 differs from the legacy Gen3 doc (`POUCH_GEN4_ARCHITECTURE.md`, actually written against Gen3 pins/behavior) mainly in: reference-pressure capture after startup relief (`captureReferencePressure()`), a pressure-actuation threshold to skip near-zero channels, and vibration auto-timeout (`VIBRATION_DURATION_MS`). When editing Gen4, verify behavior against the actual `.ino` files rather than trusting that doc verbatim.

## Web app architecture (`POUCH_APP/`)

`app.py` is a single-file Flask backend:
- `SerialManager` owns the pyserial connection and a background reader thread (`_read_loop`) that parses telemetry CSV lines and pushes them into `device_state["last_telemetry"]` plus a bounded `Queue`.
- Command endpoints (`/api/commands/start|stop|emergency|vibration`) build a protocol string and funnel through `send_command_helper` → `SerialManager.send_command`.
- `/api/command` accepts a raw protocol string, validated by `_validate_command` (permissive — checks shape, not full grammar).
- Telemetry is polled by the frontend via `/api/telemetry`, not pushed (no WebSocket yet).
- Static frontend (`static/index.html` + `app.js` + `style.css`) mirrors the SVG mockup in `gui_mockups/`.

When adding a new device command, it must be added in three places to stay consistent: the firmware parser (`POUCH_ESP_GEN4/serial.ino`), `_validate_command` in `app.py`, and a corresponding `/api/commands/*` route + frontend control.