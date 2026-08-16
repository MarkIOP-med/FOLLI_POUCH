# FOLLI_CNTRL_Gen6 — Architecture & Design Reference

## What This Is

ESP32 firmware for **FOLLISAVE Gen6** — a pneumatic headband pressure controller with
**no physical control unit** (no keyboard, no NeoPixel LEDs, no OLED display). All
control and status live off-board: the **CONSOLE app over BLE** (see
`FOLLI_CONSOLE/FOLLI_COMSOLE_OVERVIEW.md`) is the primary interface, with a USB-serial
text protocol available in parallel (used by `POUCH_APP/`). A separate
POUCH_DIAGNOSTICS serial/WiFi monitoring stream is planned but not yet implemented.

Gen6 replaces Gen4/Gen5 (formerly documented here as "Gen3" — see git history if you
need the old keyboard/LED/display-based hardware's behavior). The pressure-control
core carried forward unchanged; everything that used to be a physical key or LED is
now a BLE or serial command instead.

---

## Core vs Peripheral

The firmware is split by responsibility, not by folder (Arduino only auto-compiles
`.ino` files sitting flat in the sketch root, so this boundary is enforced by
convention and by `config.h`'s layout):

- **CORE** — get each V_NODE's actual pressure to its target. Owns the valve/pump/relief
  pins and the channel state machine (`pneumatics.ino`, `analogSensor.ino`). Nothing
  outside those two files may drive `valvePins`/`PUMP_PIN`/`RELIEF_PIN` or touch the
  channel-state statics directly.
- **PERIPHERAL** — decides *what* the targets should be, or reads/actuates hardware the
  pressure loop doesn't need (`serial.ino`, `ble.ino`, `vibration.ino`, `fsr.ino`).
  Peripherals only ever write to the shared control state in `config.h`
  (`targetPressure[]`, `massageLevel[]`, `deviceOn`, ...) and let CORE act on it next tick.

---

## Pneumatic System Topology

```
         [PUMP]
            |
         [MANIFOLD] ──── [Manifold Pressure Sensor]  p[0] = GPIO36
            |
     ┌──────┼──────┬──────────┐
  valve[0] valve[1] valve[2] valve[3]     [RELIEF_PIN] → atmosphere
     |       |       |       |
   FRONT   TEMPLE   EAR     BACK
   p[1]    p[2]    p[3]    p[4]
  (GPIO32) (GPIO33) (GPIO34) (GPIO35)
```

**Pressure control logic (unchanged from prior generations):**
- To **increase** a PAD: open its valve + run pump simultaneously → manifold fills → PAD
  equalizes up → pump stops → valve stays open one phase → valve closes → PAD retains pressure.
- To **decrease** a PAD: open its valve + open relief simultaneously → PAD connects to manifold
  → both vent to atmosphere.
- **Emergency / STOP**: open all 4 PAD valves + relief simultaneously → everything vents.

Each V_NODE also has a vibration motor (one GPIO drives a coupled L/R pair through the
FLOW_LINK connectors) and, via the two FLOW_LINK connectors (LEFT/RIGHT) to the
headband, an FSR force sensor per side — 8 FSR channels total, read over SPI from an
external MCP3008 ADC (not direct analog pins).

---

## File Structure

| File | Group | Responsibility |
|---|---|---|
| `POUCH_ESP_GEN4.ino` | — | `setup()` and `loop()` only |
| `config.h` | — | All pins, tuning params, global variables, enums, `#define` constants, function declarations |
| `pneumatics.ino` | CORE | Valve/pump/relief init, state machine, non-blocking pressure control |
| `analogSensor.ino` | CORE | Analog pressure sensor reading and pressure update |
| `serial.ino` | PERIPHERAL | Serial command parsing + CSV telemetry logging |
| `ble.ino` | PERIPHERAL | NimBLE GATT server — command channel + telemetry notify |
| `vibration.ino` | PERIPHERAL | Vibration motor init and level control, auto-timeout |
| `fsr.ino` | PERIPHERAL | 8-channel FSR read via MCP3008 SPI ADC |

---

## Main Loop Order

```cpp
void loop() {
  // CORE: sense current pressures
  readAnalogSensors();
  updateCurrentPressures();

  // PERIPHERAL: read auxiliary sensors, log, take new targets from serial
  // (handleSerialCommands() runs before runStateMachine() so a same-tick command
  // takes effect this tick; BLE writes land asynchronously via the NimBLE callback,
  // independent of loop timing.)
  readFSR();
  printSerialLog();
  handleSerialCommands();

  // CORE: drive toward targetPressure[]
  runStateMachine();

  // PERIPHERAL: apply settings, push telemetry
  updateVibration();
  updateBLE();
}
```

---

## Pin Assignments

### Valves / Pump / Relief (Digital OUT)
```
valvePins[6] = {26, 4, 13, 14, 25, 27}

valvePins[0] = pin 26  → FRONT PAD valve
valvePins[1] = pin 4   → TEMPLE PAD valve
valvePins[2] = pin 13  → EAR PAD valve
valvePins[3] = pin 14  → BACK PAD valve
valvePins[4] = pin 25  → RELIEF_PIN
valvePins[5] = pin 27  → PUMP_PIN
```

### Vibration Motors (PWM OUT)
```
vibrationPins[4] = {16, 17, 21, 22}
vibrationPins[0..3] → FRONT, TEMPLE, EAR, BACK motors (each drives a coupled L/R pair)
```

### FSR Sensors (SPI, via MCP3008 ADC)
```
MCP3008_CS = GPIO 5
NUM_FSR    = 8   → fsrData[0..7], read in MCP3008 channel order

2 FLOW_LINK connectors (LEFT, RIGHT) × 4 V_NODEs (FRONT, TEMPLE, EAR, BACK).
TODO: which MCP3008 channel is which connector/PAD is not yet confirmed
against the physical harness.
```

### Analog Pressure Sensors (Analog IN, 3.3V supply, 12-bit)
```
analogPressureSensorPins[5] = {36, 32, 33, 34, 35}

p[0] = GPIO36 → Manifold pressure  (PUMP_SENSOR = 0)
p[1] = GPIO32 → FRONT PAD pressure
p[2] = GPIO33 → TEMPLE PAD pressure
p[3] = GPIO34 → EAR PAD pressure
p[4] = GPIO35 → BACK PAD pressure
```

Note the manifold sensor is index 0 here (not the last index as in prior generations)
— `updateCurrentPressures()` reads pads from `p[i+1]` accordingly.

---

## BLE Command Protocol (`ble.ino`)

Full spec: `FOLLI_CONSOLE/FOLLI_COMSOLE_OVERVIEW.md`. Service `4fafc201-…`, command
characteristic `beb5483e-…` (4-byte write), telemetry characteristic `d68a2a54-…`
(6-byte notify, every 250 ms).

**Command bytes:**

| Byte | Meaning |
|---|---|
| 0 | V-Node — `0x01`=FRONT, `0x02`=TEMPLE, `0x03`=EAR, `0x04`=BACK (positional; doc's "Left/Right Temple" labels predate the EAR pad) |
| 1 | Target pressure, mmHg, direct value |
| 2 | Massage level, 0–3 |
| 3 | Operation mode — see below |

**Byte 3 (Operation Mode):**

| Value | Meaning |
|---|---|
| `0x00` | Emergency shutoff — vent all + stop all vibration |
| `0x01` | Static hold — apply byte1/byte2 to byte0's V-Node (normal per-node set) |
| `0x02` | Dynamic/pulse mode — **not implemented**, ignored if sent |
| `0x03` | Restore — recall last-set pressures, all 4 V-Nodes (bytes 0-2 ignored) |
| `0x04` | Reset — recall factory defaults, all 4 V-Nodes (bytes 0-2 ignored) |
| `0x05` | Device off — vent + stop vibration + halt (bytes 0-2 ignored) |
| `0x06` | Device on — resume from device off (bytes 0-2 ignored) |

`0x03`–`0x06` are firmware extensions beyond the original doc, added to cover the
system-level actions (restore/reset/on-off) the old physical keyboard supported —
mirrored in `FOLLI_COMSOLE_OVERVIEW.md` Section 3.

**Telemetry payload** (6 bytes, pushed every 250 ms): byte 0-3 = FRONT/TEMPLE/EAR/BACK
current pressure (mmHg, clamped to a byte); byte 4 = battery SoC (**not measured on
this hardware yet — always 0**); byte 5 = system error flag (**no leak/over-temp
detection wired up yet — always 0/healthy**).

---

## Serial Protocol (`serial.ino`, mirrored by `POUCH_APP/app.py`)

- `X,Y` — set channel X (0–3) target to Y mmHg
- `X1,Y1;X2,Y2;...` — batch set multiple channels
- `s` — stop
- `r` / `emergency` — emergency relief, all PADs vent
- `vib:L0,L1,L2,L3` — set vibration levels per channel (0–3)
- Outbound telemetry, one CSV line per loop:
  `time,FRN_T,FRN_A,TMP_T,TMP_A,EAR_T,EAR_A,BCK_T,BCK_A,MAN,FSR0,FSR1,FSR2,FSR3,FSR4,FSR5,FSR6,FSR7`

---

## Enums

```cpp
enum SystemState {
  IDLE,
  PRESSURIZING,      // actively driving all channels to targets
  MAINTENANCE,       // targets reached, cycling channels to hold pressures
  EMERGENCY_RELIEF,  // venting everything immediately
  STOPPED            // full halt
};
```

---

## Global State Variables

| Variable | Type | Initial Value | Purpose | Group |
|---|---|---|---|---|
| `currentState` | `SystemState` | `IDLE` | State machine state | CORE |
| `targetPressure[4]` | `int` | `{0,0,0,0}` | Target mmHg per PAD | CORE control state |
| `currentPressure_gage[4]` | `float` | `{0.0}` | Actual measured PAD pressure | CORE control state |
| `manifoldPressure_gage` | `float` | `0.0` | Actual measured manifold pressure | CORE control state |
| `deviceOn` | `bool` | `true` | ON/OFF state, toggled via BLE mode `0x05`/`0x06` | CORE control state |
| `currentChannel` | `int` | `0` | Which PAD `updateChannels()` is currently servicing | CORE |
| `savedPressure[4]` | `int` | `= defaultPressure` | Last user-set pressures (RESTORE target) | PERIPHERAL |
| `massageLevel[4]` | `int` | `{0,0,0,0}` | Current vibration level per PAD (0–3) | PERIPHERAL |
| `vibStartTime[4]` | `unsigned long` | `{0,0,0,0}` | `millis()` when vibration last started per PAD | PERIPHERAL |
| `fsrData[8]` | `uint16_t` | — | Latest MCP3008 reads, one per FSR channel | PERIPHERAL |

There is no `selectedPad` any more — every BLE/serial command carries its own target
V-Node directly, so there's no stateful "currently selected PAD" to track.

---

## Configurable Parameters (all in `config.h`)

```cpp
int PRESSURE_TOLERANCE_MMHG           = 3;      // ± tolerance for "at target"
int PRESSURE_ACTUATION_THRESHOLD_MMHG = 10;      // min actual pressure to trigger valve actuation
int VIBRATION_DURATION_MS             = 30000;   // ms vibration runs before auto-off

int defaultPressure[4]  = {0, 200, 0, 200};      // FRONT, TEMPLE, EAR, BACK (mmHg)
int vibPWM[4]           = {0, 85, 170, 255};     // PWM for vib levels 0, 1, 2, 3

const int overSampling       = 4;
const int overSamplingDelay  = 5;    // ms between oversampling cycles
const int sensorDelayMeasur  = 50;   // µs between sensors in one cycle

// Sensor conversion (3.3V supply, 0–100 kPa)
const float Vmin     = 0.2;
const float Vmax     = 2.7;
const float Pmax_kPa = 100.0;
```

`PRESSURE_STEP_MMHG`, `LONG_PRESS_MS`, and `DISPLAY_UPDATE_INTERVAL` no longer exist —
they were keyboard/display-only. BLE/serial commands send absolute pressures directly
instead of stepping.

---

## Functions by File

### `POUCH_ESP_GEN4.ino`
- `setup()`
- `loop()`

### `pneumatics.ino` (CORE)
| Function | Description |
|---|---|
| `initValves()` | Set all valve/pump/relief pins as OUTPUT, write LOW |
| `reliefStartup()` | Open all PAD valves + relief for 1s at startup → vent to atmosphere |
| `runStateMachine()` | Called every loop — reads `currentState`, dispatches to correct action |
| `updateChannels()` | Non-blocking: one phase per call, pulses pump or relief per channel until targets met, cycles channels 0→3 |
| `reliefAllPads()` | Open all 4 PAD valves + relief simultaneously, clear targets, return to IDLE |
| `resetChannelState()` | Reset the internal channel-service statics (active/phase/timer) |

### `analogSensor.ino` (CORE)
| Function | Description |
|---|---|
| `readAnalogSensors()` | Oversampled analog read of all 5 pressure sensors → stores in `p[]` (mmHg) |
| `updateCurrentPressures()` | Copies `p[1..4]` → `currentPressure_gage[]`, `p[0]` → `manifoldPressure_gage` |
| `captureReferencePressure()` | Capture atmospheric baseline into `referencePressure[]` after a full relief |

### `serial.ino` (PERIPHERAL)
| Function | Description |
|---|---|
| `handleSerialCommands()` | Parse incoming serial — `X,Y`, `X1,Y1;X2,Y2`, `s`, `r`/`emergency`, `vib:` |
| `clearSerialBuffer()` | Flush incoming serial buffer |
| `printSerialLog()` | Print one CSV telemetry line per loop |

### `ble.ino` (PERIPHERAL)
| Function | Description |
|---|---|
| `initBLE()` | Start the NimBLE GATT server, register command/telemetry characteristics, begin advertising |
| `updateBLE()` | Push a telemetry notify every `TELEMETRY_INTERVAL_MS` (250 ms) |
| `CommandCallbacks::onWrite()` | Decodes the 4-byte command and dispatches per the Operation Mode table above |

### `vibration.ino` (PERIPHERAL)
| Function | Description |
|---|---|
| `initVibration()` | Set all vibration pins as OUTPUT, write 0 |
| `updateVibration()` | Apply `vibPWM[massageLevel[i]]` to each PAD's motor, auto-off after `VIBRATION_DURATION_MS` |
| `stopAllVibration()` | Write 0 to all motors, reset all `massageLevel[]` to 0 |

### `fsr.ino` (PERIPHERAL)
| Function | Description |
|---|---|
| `initFSR()` | Configure the MCP3008 chip-select pin, start SPI |
| `readFSR()` | Read all 8 MCP3008 channels into `fsrData[]` |

---

## Command Behaviours

### Setting a pressure / massage level — BLE mode `0x01` or serial `X,Y`
- Sets `targetPressure[node]` (and `savedPressure[node]`, so RESTORE can recall it later)
- BLE also sets `massageLevel[node]` from byte 2 directly (`if > 0`, `vibStartTime[node] = millis()`)
- Resets `currentChannel = 0` and calls `resetChannelState()`, then triggers `currentState = PRESSURIZING`

### Restore / Reset — BLE mode `0x03`/`0x04` (no serial equivalent yet)
- **RESTORE**: `targetPressure = savedPressure` (all 4) → `reliefAllPads()` + `captureReferencePressure()` first → PRESSURIZING
- **RESET**: `targetPressure = defaultPressure`, `savedPressure = defaultPressure` (all 4) → same sequence → PRESSURIZING

### Emergency / Stop
- Serial `s` → `currentState = STOPPED` (full halt)
- Serial `r`/`emergency` → sets `currentState = EMERGENCY_RELIEF`; `reliefAllPads()` then runs on the *next* `loop()` tick via `runStateMachine()`, not synchronously — vents and returns to IDLE
- BLE mode `0x00` → calls `reliefAllPads()` + `stopAllVibration()` directly/synchronously (no state-machine round-trip) — vents and returns to IDLE

### Device On/Off — BLE mode `0x05`/`0x06`
- **OFF**: `stopAllVibration()` + `reliefAllPads()` + `currentState = STOPPED` + `deviceOn = false`
- **ON**: `currentState = IDLE` + `deviceOn = true`

### savedPressure Update Rule
- Initialised to `defaultPressure` at startup
- Updated on every command that sets a target pressure (BLE static-hold, serial `X,Y`)
- RESTORE applies `savedPressure`; RESET resets both `targetPressure` and `savedPressure` to defaults

### Startup Sequence
1. Serial init (9600 baud)
2. `analogReadResolution(12)`
3. `initValves()` (CORE), then `initVibration()`, `initFSR()`, `initBLE()` (PERIPHERAL)
4. `savedPressure = defaultPressure`
5. `reliefStartup()` — vent all to atmosphere
6. 500ms delay, `captureReferencePressure()`, `clearSerialBuffer()`
7. `currentState = IDLE` — no pressure applied, ready
