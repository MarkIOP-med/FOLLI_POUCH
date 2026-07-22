# FOLLI_CNTRL_Gen3 — Architecture & Design Reference

## What This Is

Arduino firmware for **FOLLISAVE Gen3** — a pneumatic headband pressure controller with a
physical control unit (keyboard + NeoPixel LEDs + OLED display).

Gen3 merges:
- **Gen2** working pneumatic pressure control (see `LEGACY/FOLLI_CNTRL_Gen2/`)
- **Gen3_SHLOMO** hardware pin layout + keyboard/LED infrastructure (see `LEGACY/FOLLI_CNTRL_Gen3_SHLOMO/`)

Read the legacy description files for full background. This document defines what Gen3 is.

---

## Pneumatic System Topology

```
         [PUMP]
            |
         [MANIFOLD] ──── [Manifold Pressure Sensor]  p[4] = A11
            |
     ┌──────┼──────┬──────────┐
  valve[0] valve[1] valve[2] valve[3]     [RELIEF_PIN] → atmosphere
     |       |       |       |
   FRONT   TEMPLE   EAR     BACK
   p[0]    p[1]    p[2]    p[3]
   (A7)    (A8)    (A9)   (A10)
```

**Pressure control logic:**
- To **increase** a PAD: open its valve + run pump simultaneously → manifold fills → PAD
  equalizes up → pump stops → valve stays open one phase → valve closes → PAD retains pressure.
- To **decrease** a PAD: open its valve + open relief simultaneously → PAD connects to manifold
  → both vent to atmosphere.
- **Emergency / STOP**: open all 4 PAD valves + relief simultaneously → everything vents.

---

## File Structure

| File | Responsibility |
|---|---|
| `FOLLI_CNTRL_Gen3.ino` | `setup()` and `loop()` only |
| `config.h` | All pins, tuning params, global variables, enums, `#define` constants, function declarations |
| `pneumatics.ino` | Valve/pump/relief init, state machine, non-blocking pressure control |
| `analogSensor.ino` | Analog pressure sensor reading and pressure update |
| `display.ino` | OLED display init and update |
| `serial.ino` | Serial command parsing |
| `keyboard.ino` | Key scanning, debounce, event detection, key-to-action logic, serial debug output |
| `leds.ino` | NeoPixel LED control and state-driven LED sync |
| `vibration.ino` | Vibration motor init and level control |

---

## Main Loop Order

```cpp
void loop() {
  readAnalogSensors();
  updateCurrentPressures();
  handleSerialCommands();
  handleKeyEvents();
  checkLongPress();
  runStateMachine();
  updateVibration();
  updateLeds();
  updateDisplay();
}
```

---

## Pin Assignments

### Valves / Pump / Relief (Digital OUT)
```
valvePins[6] = {22, 23, 24, 25, 26, 27}

valvePins[0] = pin 22  → FRONT PAD valve
valvePins[1] = pin 23  → TEMPLE PAD valve
valvePins[2] = pin 24  → EAR PAD valve
valvePins[3] = pin 25  → BACK PAD valve
valvePins[4] = pin 26  → RELIEF_PIN
valvePins[5] = pin 27  → PUMP_PIN
```

### Vibration Motors (PWM OUT)
```
vibrationPins[6] = {2, 3, 4, 5, 6, 7}
vibrationPins[0..3] → FRONT, TEMPLE, EAR, BACK motors
```

### FSR Sensors (Analog IN)
```
fsrPins[6] = {A0, A1, A2, A3, A4, A5}
```

### Analog Pressure Sensors (Analog IN, 3.3V supply)
```
analogPressureSensorPins[5] = {A7, A8, A9, A10, A11}

p[0] = A7  → FRONT PAD pressure
p[1] = A8  → TEMPLE PAD pressure
p[2] = A9  → EAR PAD pressure
p[3] = A10 → BACK PAD pressure
p[4] = A11 → Manifold pressure  (PUMP_SENSOR = 4)
```

### Keyboard (Digital IN, INPUT_PULLUP, active LOW)
```
kbdPins[17] = {44, 43, 42, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 45, 46, 47}
```

Note: pin order is reversed relative to the physical Arduino pin numbers because
the keyboard connector is wired in reverse (pin 44 = first key, pin 31 = last key,
side buttons on pins 45–47 are sequential and unchanged).

### NeoPixel LEDs
```
LED_PIN  = 19
NUM_LEDS = 8
```

### OLED Display (I2C)
```
SH1106G 128×64, address 0x3C
DISPLAY_RESET = -1  (no dedicated reset pin — pin 34 is used by keyboard KEY_VIB_3)
```

---

## Key Mapping (verified on hardware)

| Define | idx | pin | Line | Function |
|---|---|---|---|---|
| `KEY_FRONT` | 0 | 44 | 1 | Select FRONT PAD |
| `KEY_TEMPLE` | 1 | 43 | 1 | Select TEMPLE PAD |
| `KEY_EAR` | 2 | 42 | 1 | Select EAR PAD |
| `KEY_BACK` | 3 | 41 | 1 | Select BACK PAD |
| `KEY_UP` | 4 | 40 | 2 | Increase pressure on selected PAD |
| `KEY_ZERO` | 5 | 39 | 2 | Vent selected PAD to zero |
| `KEY_DOWN` | 6 | 38 | 2 | Decrease pressure on selected PAD |
| `KEY_VIB_0` | 7 | 37 | 3 | Vibration level 0 (off) |
| `KEY_VIB_1` | 8 | 36 | 3 | Vibration level 1 (low) |
| `KEY_VIB_2` | 9 | 35 | 3 | Vibration level 2 (mid) |
| `KEY_VIB_3` | 10 | 34 | 3 | Vibration level 3 (high) |
| `KEY_RESTORE` | 11 | 33 | 4 | Restore all PADs to saved pressures |
| `KEY_RESET` | 12 | 32 | 4 | Restore all PADs to default pressures |
| `KEY_STOP` | 13 | 31 | 4 | Vent all PADs to zero |
| `KEY_SIDE_DOWN` | 14 | 45 | side | Long press = device ON/OFF |
| `KEY_SIDE_MIDDLE` | 15 | 46 | side | TBD |
| `KEY_SIDE_UP` | 16 | 47 | side | TBD |

---

## LED Mapping (verified on hardware)

NeoPixel strip physical order: VIB group first (leds 0–3), PAD group second (leds 4–7).
Within each group the strip is wired in reverse (VIB_3 at led0, FRONT at led4).

```
Physical position:  led0    led1    led2    led3  |  led4    led5    led6    led7
Function:          VIB_3  VIB_2  VIB_1  VIB_0  |  FRONT  TEMPLE   EAR    BACK
```

| Define | Physical idx | Line | Behaviour |
|---|---|---|---|
| `LED_FRONT` | 4 | 1 | GREEN when FRONT PAD selected |
| `LED_TEMPLE` | 5 | 1 | GREEN when TEMPLE PAD selected |
| `LED_EAR` | 6 | 1 | GREEN when EAR PAD selected |
| `LED_BACK` | 7 | 1 | GREEN when BACK PAD selected |
| `LED_VIB_0` | 3 | 3 | GREEN when vib level 0 active |
| `LED_VIB_1` | 2 | 3 | GREEN when vib level 1 active |
| `LED_VIB_2` | 1 | 3 | GREEN when vib level 2 active |
| `LED_VIB_3` | 0 | 3 | GREEN when vib level 3 active |

Only one PAD LED and at most one VIB LED are on at any time. All 8 LED values are
written to the buffer on every `updateLeds()` call before a single `pixels.show()`.

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

| Variable | Type | Initial Value | Purpose |
|---|---|---|---|
| `currentState` | `SystemState` | `IDLE` | State machine state |
| `selectedPad` | `int` | `-1` (none) | Currently selected PAD on control unit |
| `targetPressure[4]` | `int` | `{0,0,0,0}` | Target mmHg per PAD |
| `currentPressure_gage[4]` | `float` | `{0.0}` | Actual measured PAD pressure |
| `manifoldPressure_gage` | `float` | `0.0` | Actual measured manifold pressure |
| `savedPressure[4]` | `int` | `= defaultPressure` | Last user-set pressures (RESTORE target) |
| `massageLevel[4]` | `int` | `{0,0,0,0}` | Current vibration level per PAD (0–3) |
| `deviceOn` | `bool` | `true` | ON/OFF state, toggled by KEY_SIDE_DOWN long press |
| `kbdEventFlag` | `bool` | `false` | Set when any key press is detected |
| `lastKeyPressed` | `int` | `-1` | Index of last detected key press |

---

## Configurable Parameters (all in `config.h`)

```cpp
int PRESSURE_STEP_MMHG        = 5;      // mmHg change per UP or DOWN key press
int PRESSURE_TOLERANCE_MMHG   = 3;      // ± tolerance for "at target"
int LONG_PRESS_MS             = 2000;   // ms hold for KEY_SIDE_DOWN ON/OFF
int DISPLAY_UPDATE_INTERVAL   = 500;    // ms between OLED refreshes

int defaultPressure[4]  = {40, 120, 50, 120};  // FRONT, TEMPLE, EAR, BACK (mmHg)
int vibPWM[4]           = {0, 85, 170, 255};   // PWM for vib levels 0, 1, 2, 3

const int overSampling       = 16;
const int overSamplingDelay  = 5;    // ms between oversampling cycles
const int sensorDelayMeasur  = 50;   // µs between sensors in one cycle
```

---

## Functions by File

### `FOLLI_CNTRL_Gen3.ino`
- `setup()`
- `loop()`

### `pneumatics.ino`
| Function | Description |
|---|---|
| `initValves()` | Set all valve/pump/relief pins as OUTPUT, write LOW |
| `reliefStartup()` | Open all PAD valves + relief for 1s at startup → vent to atmosphere |
| `runStateMachine()` | Called every loop — reads `currentState`, dispatches to correct action |
| `updateChannels()` | Non-blocking: one phase per call, pulses pump or relief per channel until targets met, cycles channels 0→3 |
| `reliefAllPads()` | Open all 4 PAD valves + relief simultaneously, clear targets, return to IDLE |

### `analogSensor.ino`
| Function | Description |
|---|---|
| `readAnalogSensors()` | Oversampled analog read of all 5 pressure sensors → stores in `p[]` (mmHg) |
| `updateCurrentPressures()` | Copies `p[0..3]` → `currentPressure_gage[]`, `p[4]` → `manifoldPressure_gage` |

### `display.ino`
| Function | Description |
|---|---|
| `initDisplay()` | Init SH1106G OLED, show splash screen |
| `updateDisplay()` | Refresh every `DISPLAY_UPDATE_INTERVAL` ms — shows state, selected PAD, all pressures, last key, active LEDs |

### `serial.ino`
| Function | Description |
|---|---|
| `handleSerialCommands()` | Parse incoming serial — `X,Y`, `X1,Y1;X2,Y2`, `s`, `r`, `emergency` |
| `clearSerialBuffer()` | Flush incoming serial buffer |

### `keyboard.ino`
| Function | Description |
|---|---|
| `initKeyboard()` | Set all 17 key pins as INPUT_PULLUP, init debounce state |
| `readKeyboard()` | Debounced scan of all keys, sets `kbdEventFlag` + `lastKeyPressed` on press edge |
| `handleKeyEvents()` | Maps key press to action; always calls `printKeyDebug()` after action |
| `checkLongPress()` | Monitors KEY_SIDE_DOWN hold duration, toggles `deviceOn` at `LONG_PRESS_MS` |
| `printKeyDebug()` | Prints key idx, pin, name, and active LEDs to serial after every press |

### `leds.ino`
| Function | Description |
|---|---|
| `initLeds()` | Init NeoPixel strip, turn all off |
| `updateLeds()` | Sets all 8 LED values using `padLed[]`/`vibLed[]` lookup arrays, calls `pixels.show()` once |
| `setLed(index, color)` | Set one LED by physical index and Color struct |
| `allLedsOff()` | Clear all LEDs |

### `vibration.ino`
| Function | Description |
|---|---|
| `initVibration()` | Set all vibration pins as OUTPUT, write 0 |
| `updateVibration()` | Apply `vibPWM[massageLevel[selectedPad]]` to the active PAD's motor |
| `stopAllVibration()` | Write 0 to all motors, reset all `massageLevel[]` to 0 |

---

## Key Behaviours

### PAD Selection (Line 1)
- Press a PAD key → `selectedPad` = that index → its LED GREEN, all others off
- Line 2 and Line 3 actions apply to `selectedPad`
- On startup: `selectedPad = -1` — Line 2/3 keys ignored until a PAD is chosen

### Pressure Control (Line 2) — acts on `selectedPad`
- **UP**: `targetPressure[selectedPad] += PRESSURE_STEP_MMHG` → save → PRESSURIZING
- **DOWN**: `targetPressure[selectedPad] -= PRESSURE_STEP_MMHG` → save → PRESSURIZING
- **ZERO**: `targetPressure[selectedPad] = 0` → open valve[selectedPad] + relief → vent that PAD

### Vibration Control (Line 3) — acts on `selectedPad`
- Press VIB_0/1/2/3 → `massageLevel[selectedPad]` = that level → LED lights GREEN
- All 4 levels light their LED (including VIB_0)

### System Commands (Line 4)
- **RESTORE**: `targetPressure = savedPressure` → PRESSURIZING
- **RESET**: `targetPressure = defaultPressure`, `savedPressure = defaultPressure` → PRESSURIZING
- **STOP**: `reliefAllPads()` + `stopAllVibration()`

### Side Buttons
- **KEY_SIDE_DOWN** (pin 45): long press → toggle `deviceOn` → OFF: vent all + stop vib + STOPPED; ON: IDLE
- **KEY_SIDE_MIDDLE** (pin 46): TBD
- **KEY_SIDE_UP** (pin 47): TBD

### savedPressure Update Rule
- Initialised to `defaultPressure` at startup
- Updated on every UP or DOWN key press for the affected PAD
- RESTORE applies `savedPressure`; RESET resets both `targetPressure` and `savedPressure` to defaults

### Startup Sequence
1. Serial init (9600 baud)
2. `analogReadResolution(12)`
3. `initValves()` + `initVibration()`
4. `Wire.begin()` + `initDisplay()`
5. `initLeds()` + `allLedsOff()`
6. `initKeyboard()`
7. `savedPressure = defaultPressure`
8. `reliefStartup()` — vent all to atmosphere
9. 500ms delay, `clearSerialBuffer()`
10. `currentState = IDLE` — no pressure applied, ready
