# FOLLI_CNTRL_Gen2 — System Description

## What This Is

Arduino firmware for **FOLLISAVE**, a pneumatic headband pressure controller.
The system inflates/deflates up to 4 pneumatic pads (PADs) worn on the head to precise target pressures, controlled via serial commands.

---

## Physical / Pneumatic Architecture

```
         [PUMP]
            |
         [MANIFOLD] ──── [Manifold Pressure Sensor]  (p[4], A11)
            |
     ┌──────┼──────┬──────────┐
  valve[0] valve[1] valve[2] valve[3]     [RELIEF_PIN] → atmosphere
     |       |       |       |
   PAD0    PAD1    PAD2    PAD3
   p[0]    p[1]    p[2]    p[3]
   (A7)    (A8)    (A9)   (A10)
```

**Key topology rules:**
- The pump fills the **manifold** (common pressure rail).
- Each PAD is connected to the manifold via its own normally-closed solenoid valve.
- Each PAD has its own analog pressure sensor **downstream** of the valve (reads trapped PAD pressure when valve is closed).
- The manifold also has a **single relief valve** that vents it to atmosphere.
- There is NO per-PAD relief path — the relief is manifold-only.

**Pressure control philosophy:**
- To **increase** a PAD: open its valve + run pump simultaneously → manifold fills → PAD equalizes up → pump stops → valve stays open one phase → valve closes → PAD retains pressure.
- To **decrease all PADs** (emergency): open all 4 valves + RELIEF simultaneously → everything vents to atmosphere.
- Fine-grained per-PAD pressure reduction: **not fully implemented** (see Known Issues).

---

## Pin Assignments

### Valve / Pump / Relief (Digital OUT)
```
valvePins[9] = {22, 23, 24, 25, 26, 27, 28, 29, 30}

valvePins[0] = pin 22  → PAD 0 valve
valvePins[1] = pin 23  → PAD 1 valve
valvePins[2] = pin 24  → PAD 2 valve
valvePins[3] = pin 25  → PAD 3 valve
valvePins[4] = pin 26  → UNUSED (reserved)
valvePins[5] = pin 27  → UNUSED (reserved)
valvePins[6] = pin 28  → RELIEF_PIN  (vents manifold to atmosphere)
valvePins[7] = pin 29  → PUMP_PIN    (runs the compressor/pump)
valvePins[8] = pin 30  → UNUSED (reserved)
```

### Compressor Pins (Digital OUT) — declared but UNUSED in firmware
```
compressorPins[5] = {31, 32, 33, 34, 35}   // reserved for future hardware options
```

### Vibration Motors (Digital/PWM OUT)
```
vibrationPins[8] = {2, 3, 4, 5, 9, 8, 7, 6}   // 8 vibration motors
```
Note: order is intentionally non-sequential (hardware routing).

### FSR Sensors (Analog IN)
```
fsrPins[8] = {A0, A1, A2, A3, A7, A6, A5, A4}  // 8 Force Sensitive Resistors
```
**Warning:** A7 appears in both `fsrPins` and `analogPressureSensorPins[0]`. Not a runtime
problem since FSR functions are test utilities only (never called from main loop).

### Analog Pressure Sensors (Analog IN, 3.3V supply)
```
analogPressureSensorPins[5] = {A7, A8, A9, A10, A11}

p[0] = A7  → PAD 0 pressure
p[1] = A8  → PAD 1 pressure
p[2] = A9  → PAD 2 pressure
p[3] = A10 → PAD 3 pressure
p[4] = A11 → Manifold pressure   (#define PUMP_SENSOR 4)
```

### Sensor Enable Pins — declared but UNUSED
```
senPins[5] = {40, 41, 42, 43, 44}   // were for MS5806 digital sensors (abandoned)
```

### OLED Display (I2C)
```
SH1106G 128×64, address 0x3C
DISPLAY_RESET = pin 34
```

---

## Pressure Sensor Reading

- **Type:** Analog (ratiometric, 3.3V supply)
- **Conversion:** `Vmin=0.2V`, `Vmax=2.7V`, `Pmax=100 kPa`
- **Oversampling:** 16 samples per sensor per read cycle, 5ms between cycles
- **Output unit:** mmHg (rounded to nearest integer)
- **ADC resolution:** 12-bit (`analogReadResolution(12)`)

Formula:
```
voltage       = (raw / 4095.0) * 3.3
pressure_kPa  = (voltage - 0.2) * (100.0 / 2.5)
pressure_mmHg = pressure_kPa * 7.50062
```

**Note:** MS5806 SPI digital sensor code is present in config.h (`cof_arr`, `cof_control`,
`Press_raw`, `Temp_raw`, `dT`) and declared as functions (`init_sensors`, `GetMS5806CoeffsAll`,
`PressureSensorResetAll`) but **never implemented or called**. This was an abandoned approach.

---

## File Structure

| File | Purpose |
|---|---|
| `config.h` | All pin definitions, tuning parameters, global variables, state enum, function declarations |
| `FOLLI_CNTRL_Gen2.ino` | `setup()`, `loop()`, state machine, non-blocking service function |
| `analogSensor.ino` | `readAnalogSensors()`, `updateCurrentPressures()` |
| `display.ino` | `initDisplay()`, `updateDisplay()` — SH1106G OLED |
| `pneumatics.ino` | `initValveCompressorVibration()`, `reliefAllPstart()` |
| `serial.ino` | `handleSerialCommands()`, `printStatusToSerial()`, `clearSerialPort0()` |
| `testVeb_fsr.ino` | `printFsr()`, `testVeb()` — test utilities, never called from main loop |

---

## Tuning Parameters (config.h)

```cpp
PRESSURE_TOLERANCE_MMHg = 3    // ± tolerance for "at target"
VALVE_PULSE_MS          = 5    // (defined but not used in timing — actual timing is phase-based)
PUMP_PULSE_NORMAL_MS    = 10   // (defined but not used directly)
PUMP_PULSE_HIGH_MS      = 50   // (defined but not used directly)
VALVE_SETTLE_MS         = 150  // (defined but not used directly)
MAINTENANCE_INTERVAL_MS = 2500 // (defined but not used directly)
```
Note: the actual pulse timing is controlled by the 30ms inter-phase timer and the sensor read
cycle (~80ms due to oversampling). The named constants above are legacy/placeholder.

---

## State Machine

```
IDLE
  ↓  (new targets received via serial)
BATCH_PUMPING
  ↓  (all 4 channels serviced once)
MAINTENANCE   ←──────────────────┐
  │  (keeps cycling channels)    │
  └──────────────────────────────┘

At any time:
  "s" command  → STOPPED   (halts everything)
  "r" command  → EMERGENCY_RELIEF → IDLE
```

States:
- **IDLE**: does nothing, waiting for commands
- **BATCH_PUMPING**: services channels 0→1→2→3 sequentially, then transitions to MAINTENANCE
- **MAINTENANCE**: keeps cycling all 4 channels indefinitely to hold targets
- **EMERGENCY_RELIEF**: opens all 4 PAD valves + RELIEF instantly, then returns to IDLE
- **STOPPED**: full stop, no servicing

---

## Non-Blocking Control Loop

The firmware avoids blocking delays. `serviceNextChannelNonBlocking()` is called every
`loop()` iteration but advances only **one phase per call**, using static flags:
- `inAction` — whether a channel service is in progress
- `phase` — which step of the pulse cycle (0, 1, or 2)
- `actionTimer` — timestamp of last phase transition (30ms minimum between phases)

Between every phase transition, `loop()` calls `readAnalogSensors()` + `updateCurrentPressures()`,
so sensor data is always fresh when a phase decision is made.

**Pump-up pulse cycle (error > 0):**
```
Phase 0: valve[ch]=HIGH, pump=HIGH       → pressurize
Phase 1: pump=LOW  (valve still HIGH)    → equalize, let PAD settle
Phase 2: valve[ch]=LOW                   → lock PAD pressure in
→ re-check error with fresh sensor reading → repeat if still off target
```

**Gradual relief pulse cycle (error < 0):**
```
Phase 0: RELIEF_PIN=HIGH                 → vent manifold
Phase 1: RELIEF_PIN=LOW
Phase 2: valve[ch]=LOW (no change)
```
⚠ See Known Issues — this does NOT actually reduce PAD pressure.

---

## Serial Command Interface (9600 baud)

| Command | Effect |
|---|---|
| `X,Y` | Set channel X (0–3) to Y mmHg. Example: `0,80` |
| `X1,Y1;X2,Y2;...` | Set multiple channels. Example: `0,60;1,30;3,0` |
| `s` | STOP — halt all servicing |
| `r` or `emergency` | Emergency relief — vent all PADs immediately |

Setting any target triggers `BATCH_PUMPING`. Setting a target to `0` vents that PAD.

---

## Startup Sequence

1. Serial init (9600)
2. `analogReadResolution(12)`
3. `initValveCompressorVibration()` — all pins LOW
4. `Wire.begin()` + `initDisplay()`
5. `reliefAllPstart()` — opens all 4 PAD valves + RELIEF for 1 second, then closes → full atmospheric vent and establishes gauge baseline (p_start)
6. 500ms delay, flush serial buffer
7. State = IDLE, ready

---

## OLED Display

Updates every 500ms. Shows:
- Current active channel
- System state (IDLE / BATCH / MAINT)
- All 4 channels: target vs actual pressure
- Manifold pressure

---

## Known Issues / Limitations

1. **Gradual per-PAD pressure reduction is broken.** When `error < 0` (PAD over-pressurized),
   only `RELIEF_PIN` opens — the PAD valve stays closed, so the PAD is isolated from the manifold
   and its pressure cannot drop. The manifold vents indefinitely but the PAD stays high.
   **Fix needed:** open `valve[currentChannel]` alongside `RELIEF_PIN` in the relief branch.

2. **Several valve and compressor pins are unused** (valvePins[4,5,8], all compressorPins).
   They were reserved for hardware options that were not pursued.

3. **A7 pin conflict** between `fsrPins[4]` and `analogPressureSensorPins[0]`. Not a runtime
   problem since FSR functions are never called in normal operation.

4. **Dead MS5806 SPI sensor code** in config.h. Was planned, never implemented.

5. **Tuning constants** (VALVE_PULSE_MS, PUMP_PULSE_NORMAL_MS, etc.) are defined but not
   wired into the actual timing logic. Actual timing is governed by the 30ms phase timer and
   the ~80ms sensor read cycle.

---

## Relationship to Other Versions

- **Gen3_SHLOMO** — hardware revision of Gen2. Reduces channels from 9 valves/8 vibes to 6 each,
  drops compressor pins, adds 17-key physical keyboard and 8 NeoPixel LEDs. Core pressure
  control logic is identical. See `LEGACY/FOLLI_CNTRL_Gen3_SHLOMO/`.
