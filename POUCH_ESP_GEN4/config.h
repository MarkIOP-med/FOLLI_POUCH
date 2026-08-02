#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include <SPI.h>

// =====================================================================
// CORE vs PERIPHERAL — the boundary this file (and the sketch) is split by:
//
//   CORE       = get each V_NODE's actual pressure to its target pressure.
//                Owns the valve/pump/relief pins and the channel state
//                machine (pneumatics.ino, analogSensor.ino). Nothing
//                outside those two files may drive valvePins/PUMP_PIN/
//                RELIEF_PIN or touch the channel-state statics directly.
//
//   PERIPHERAL = everything that decides *what* the targets should be, or
//                that reads/actuates hardware the pressure loop doesn't
//                need (serial.ino, ble.ino, fsr.ino, vibration.ino).
//                Peripherals only ever write to the shared control state
//                below (targetPressure[], massageLevel[], deviceOn, ...)
//                and let the core loop act on it next tick.
// =====================================================================

// ==================== CORE — TUNING PARAMETERS ====================
int PRESSURE_TOLERANCE_MMHG          = 3;   // ± tolerance for "at target"
int PRESSURE_ACTUATION_THRESHOLD_MMHG = 10; // min actual pressure to trigger valve actuation; below this a channel with target=0 is skipped

// Sensor oversampling
const int overSampling       = 4;
const int overSamplingDelay  = 5;    // ms between oversampling cycles
const int sensorDelayMeasur  = 50;   // µs between sensors in one cycle

// Sensor conversion (3.3V supply, 0–100 kPa)
const float Vmin     = 0.2;
const float Vmax     = 2.7;
const float Pmax_kPa = 100.0;

// ==================== CORE — PINS: VALVES / PUMP / RELIEF ====================
const int valvePins[6] = {26, 4, 13, 14, 25, 27};
// valvePins[0] = pin 26  → FRONT PAD valve
// valvePins[1] = pin 4   → TEMPLE PAD valve
// valvePins[2] = pin 13  → EAR PAD valve
// valvePins[3] = pin 14  → BACK PAD valve
// valvePins[4] = pin 25  → RELIEF_PIN
// valvePins[5] = pin 27  → PUMP_PIN

#define RELIEF_PIN  valvePins[4]
#define PUMP_PIN    valvePins[5]

// ==================== CORE — PINS: PRESSURE SENSORS ====================
#define NUM_SENSORS  5
#define PUMP_SENSOR  0   // index of manifold sensor in p[] and analogPressureSensorPins[]

const int analogPressureSensorPins[NUM_SENSORS] = {36, 32, 33, 34, 35};
// p[0]=GPIO36 Manifold  p[1]=GPIO32 FRONT  p[2]=GPIO33 TEMPLE  p[3]=GPIO34 EAR  p[4]=GPIO35 BACK

// ==================== CORE — STATE MACHINE ====================
enum SystemState {
  IDLE,
  PRESSURIZING,      // actively driving channels to targets
  MAINTENANCE,       // targets reached, holding pressures
  EMERGENCY_RELIEF,
  STOPPED
};
SystemState currentState = IDLE;

int   currentChannel          = 0;
float p[NUM_SENSORS];              // converted sensor readings (mmHg, before reference subtraction)
float referencePressure[NUM_SENSORS] = {0}; // baseline captured after startup/pre-action relief

// ==================== CORE CONTROL STATE ====================
// Written by peripherals (serial.ino / ble.ino), consumed by the core loop
// (pneumatics.ino / analogSensor.ino) — this is the boundary's API surface.
int   targetPressure[4]       = {0, 0, 0, 0};
float currentPressure_gage[4] = {0.0};
float manifoldPressure_gage   = 0.0;
bool  deviceOn                = true;

// ==================== PERIPHERAL — PRESSURE DEFAULTS (RESTORE/RESET) ====================
// The core control loop only ever looks at targetPressure[] — savedPressure/
// defaultPressure exist purely to support the RESTORE/RESET peripheral commands.
// Order: FRONT=0, TEMPLE=1, EAR=2, BACK=3
int defaultPressure[4] = {0, 200, 0, 200};
int savedPressure[4];                     // initialized in setup() from defaultPressure

// ==================== PERIPHERAL — PINS: VIBRATION ====================
// One line per V_NODE; each drives a coupled L/R vibrator pair fed through the
// FLOW_LINK connectors, so a single GPIO per PAD is correct (not one per side).
int VIBRATION_DURATION_MS = 30000;  // ms vibration runs before auto-off
int vibPWM[4]             = {0, 85, 170, 255};  // PWM for vib levels 0–3

const int vibrationPins[4] = {16, 17, 21, 22};
// vibrationPins[0..3] map to FRONT, TEMPLE, EAR, BACK

int           massageLevel[4]  = {0, 0, 0, 0};
unsigned long vibStartTime[4]  = {0, 0, 0, 0}; // millis() when vibration last started per PAD

// ==================== PERIPHERAL — PINS: FSR (via MCP3008 SPI ADC) ====================
// 8 channels = 2 FLOW_LINK connectors (LEFT, RIGHT) × 4 V_NODEs (FRONT, TEMPLE, EAR, BACK).
// TODO: which MCP3008 channel is which connector/PAD is not yet confirmed against the
// physical harness — fsrData[] is filled in channel order (0-7) until that's verified.
#define MCP3008_CS  5
#define NUM_FSR     8
uint16_t fsrData[NUM_FSR];

// ==================== FUNCTION DECLARATIONS ====================

// --- CORE ---
// pneumatics.ino
void initValves();
void reliefStartup();
void runStateMachine();
void updateChannels();
void reliefAllPads();
void resetChannelState();

// analogSensor.ino
void readAnalogSensors();
void updateCurrentPressures();
void captureReferencePressure();

// --- PERIPHERAL ---
// fsr.ino
void initFSR();
void readFSR();

// serial.ino
void handleSerialCommands();
void clearSerialBuffer();
void printSerialLog();

// vibration.ino
void initVibration();
void updateVibration();
void stopAllVibration();

// ble.ino
void initBLE();
void updateBLE();

#endif
