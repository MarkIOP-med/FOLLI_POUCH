#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include <SPI.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

// =====================================================================
// This file is organized along TWO independent axes — both matter, and
// they don't line up with each other, so both are tagged per variable:
//
//   CORE / PERIPHERAL — who in the CODE may touch it.
//     CORE       = get each V_NODE's actual pressure to its target pressure.
//                  Owns the valve/pump/relief pins and the channel state
//                  machine (pneumatics.ino, analogSensor.ino). Nothing
//                  outside those two files may drive valvePins/PUMP_PIN/
//                  RELIEF_PIN or touch the channel-state statics directly.
//     PERIPHERAL = everything that decides *what* the targets should be, or
//                  that reads/actuates hardware the pressure loop doesn't
//                  need (serial.ino, ble.ino, fsr.ino, vibration.ino).
//                  Peripherals only ever write to the shared control state
//                  and let the core loop act on it next tick.
//
//   HARDWARE / USER-TWEAKABLE / SELF-USE — where the value comes from, and
//   whether anything OUTSIDE the firmware is allowed to change it.
//     HARDWARE       = physical wiring / sensor-electrical constants tied to
//                       this board revision. Never exposed over any protocol;
//                       changing these means changing the physical hardware.
//     USER-TWEAKABLE = operational "regime" data settable by a user/admin
//                       over Serial, BLE, or (planned) WiFi.
//     SELF-USE       = internal state and tuning constants the firmware runs
//                       its own control loop on. Not exposed over any
//                       protocol today; some could become admin-configurable
//                       later without needing a reflash.
// =====================================================================


// ============================================================
// 1. HARDWARE — physical wiring & sensor-electrical constants
// ============================================================

// --- Valves / Pump / Relief pins — CORE ---
const int valvePins[6] = {26, 4, 13, 14, 25, 27};
// valvePins[0] = pin 26  → FRONT PAD valve
// valvePins[1] = pin 4   → TEMPLE PAD valve
// valvePins[2] = pin 13  → EAR PAD valve
// valvePins[3] = pin 14  → BACK PAD valve
// valvePins[4] = pin 25  → RELIEF_PIN
// valvePins[5] = pin 27  → PUMP_PIN
#define RELIEF_PIN  valvePins[4]
#define PUMP_PIN    valvePins[5]

// --- Pressure sensor pins — CORE ---
#define NUM_SENSORS  5
#define PUMP_SENSOR  0   // index of manifold sensor in p[] and analogPressureSensorPins[]
const int analogPressureSensorPins[NUM_SENSORS] = {36, 32, 33, 34, 35};
// p[0]=GPIO36 Manifold  p[1]=GPIO32 FRONT  p[2]=GPIO33 TEMPLE  p[3]=GPIO34 EAR  p[4]=GPIO35 BACK

// Sensor voltage→pressure calibration curve (3.3V supply, 0–100 kPa sensor) — CORE
// Specific to the analog pressure sensor part used on this board. Could be made
// admin/service-tunable later for batch recalibration without a reflash, but a
// bad value here silently corrupts every pressure reading, so that would need a
// tightly restricted (service/calibration-only) access tier, not general admin.
const float Vmin     = 0.2;
const float Vmax     = 2.7;
const float Pmax_kPa = 100.0;

// --- Vibration motor pins — PERIPHERAL ---
// One line per V_NODE; each drives a coupled L/R vibrator pair fed through the
// FLOW_LINK connectors, so a single GPIO per PAD is correct (not one per side).
const int vibrationPins[4] = {16, 17, 21, 22};
// vibrationPins[0..3] map to FRONT, TEMPLE, EAR, BACK

// --- FSR pins, via MCP3008 SPI ADC — PERIPHERAL ---
// 8 channels = 2 FLOW_LINK connectors (LEFT, RIGHT) × 4 V_NODEs (FRONT, TEMPLE, EAR, BACK).
// TODO: which MCP3008 channel is which connector/PAD is not yet confirmed against the
// physical harness — fsrData[] is filled in channel order (0-7) until that's verified.
#define MCP3008_CS  5
#define NUM_FSR     8


// ============================================================
// 2. USER-TWEAKABLE — regime data, settable via Serial/BLE/(WiFi)
// ============================================================

// --- Live session state — PERIPHERAL writes, CORE consumes (RAM, resets each power-cycle) ---
int  targetPressure[4]   = {0, 0, 0, 0};  // live in-session pressure target per channel (FRONT, TEMPLE, EAR, BACK)
int  vibrationLevel[4]   = {0, 0, 0, 0};  // live in-session vibration level per channel, 0-3
bool deviceOn            = true;

// --- Per-user record — PERIPHERAL, RAM only (see userProfile.ino). Set by
// initUserProfile() at startup and by Save-as-default/Assign-new-user/Reset; does NOT
// survive a power-cycle or reflash — every boot comes back up unassigned, running on
// defaultPressure. The core control loop only ever looks at targetPressure[] —
// savedPressure/userId/assigned exist purely to support the RESTORE/RESET/Save-as-
// default/Assign-new-user commands.
// Order: FRONT=0, TEMPLE=1, EAR=2, BACK=3
int defaultPressure[4] = {25, 120, 85, 130};  // global factory default, all users
int savedPressure[4];                         // this user's saved default pressure — RAM only, see userProfile.ino

// This pair plus savedPressure[4] above is the ONLY per-user data on the device —
// vibration and thresholds are system-wide, same for every user, not stored per-user
// (see PRESSURE_THRESHOLD_MMHG in section 3 below).
int  userId   = -1;     // opaque id of the user currently checked out to this pouch; -1 = none, RAM only
bool assigned = false;  // whether this device currently has a live user record, RAM only

int VIBRATION_DURATION_MS = 20000;  // ms vibration runs before auto-off (20s)
int vibPWM[4]             = {0, 85, 170, 255};  // PWM output for vibration levels 0-3


// ============================================================
// 3. SELF-USE — internal state & control-loop tuning
// ============================================================

// --- State machine — CORE ---
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
float currentPressure_gage[4] = {0.0};      // measured pressure per channel; also reported externally as read-only telemetry
float manifoldPressure_gage   = 0.0;        // measured manifold pressure; also reported externally as read-only telemetry
uint16_t fsrData[NUM_FSR];                  // raw force-sensor reads; also reported externally as read-only telemetry

unsigned long vibStartTime[4]  = {0, 0, 0, 0}; // millis() when vibration last started per PAD

// --- Control-loop tuning constants — CORE ---
int PRESSURE_TOLERANCE_MMHG          = 3;   // ± tolerance for "at target"
int PRESSURE_ACTUATION_THRESHOLD_MMHG = 10; // min actual pressure to trigger valve actuation; below this a channel with target=0 is skipped

// Planned, not yet implemented — system-wide, same for every user, not per-user:
//   int pressureThreshold[4];  // max allowed drift of live target pressure from the user's saved default, admin-gated
// NOTE: pressureThreshold is a different concept from PRESSURE_ACTUATION_THRESHOLD_MMHG
// above — that one is purely a control-loop internal for skipping near-zero channels,
// this one bounds how far a user may adjust off their own saved default. The similar
// names are a real risk of confusion; rename one of the two before either ships.

// Valve/pump control-loop timing — CORE. Previously unnamed literals in pneumatics.ino.
const unsigned long CHANNEL_PHASE_TICK_MS   = 30;    // min time between updateChannels() phase advances
const unsigned long RELIEF_VENT_DURATION_MS = 1000;  // how long relief+valves stay open during a full vent
const unsigned long STARTUP_SETTLE_MS       = 150;   // settle time after startup vent, before capturing reference

// Sensor oversampling — CORE
const int overSampling       = 4;
const int overSamplingDelay  = 5;    // ms between oversampling cycles
const int sensorDelayMeasur  = 50;   // µs between sensors in one cycle

// BLE telemetry cadence — PERIPHERAL. Moved here from ble.ino so it sits alongside the
// rest of the tuning constants; still a #define today, not runtime-adjustable.
#define TELEMETRY_INTERVAL_MS  250


// ============================================================
// 4. COMMAND QUEUE — cross-cutting infrastructure, not itself data
// ============================================================
// Every transport (Serial, BLE, WiFi later) parses its own wire format but never
// mutates shared state directly — it builds a Command and enqueues it here instead.
// loop() drains the queue once per tick, before runStateMachine(), so every command
// is applied on the main loop thread regardless of which task enqueued it (BLE's
// onWrite() callback runs in NimBLE's own FreeRTOS task, not on loop()'s — writing
// shared globals straight from there is a race once a command touches more than one
// field at a time). Adding WiFi later means writing a parser that builds the same
// Command struct and calls enqueueCommand() — nothing else changes.

enum CommandType {
  CMD_SET_TARGET,         // set one channel's pressure (+ optional vibration)
  CMD_SET_VIBRATION_ALL,  // set vibration levels, starting at channel 0
  CMD_STOP,
  CMD_EMERGENCY,
  CMD_RESTORE,
  CMD_RESET,
  CMD_DEVICE_ON,
  CMD_DEVICE_OFF,
  CMD_SAVE_AS_DEFAULT,   // current targetPressure[] -> this user's savedPressure[] (RAM only)
  CMD_ASSIGN_NEW_USER    // blank this pouch's profile and assign a fresh userId, works fully offline
};

enum CommandSource { SRC_SERIAL, SRC_BLE };  // SRC_WIFI to be added when WiFi lands

struct Command {
  CommandType   type;
  CommandSource source;
  int channel;          // 0-3; used by CMD_SET_TARGET
  int pressure;          // used by CMD_SET_TARGET
  int vibLevel;           // 0-3, or -1 = "leave unchanged" — used by CMD_SET_TARGET
  int vibLevels[4];        // used by CMD_SET_VIBRATION_ALL
  int vibLevelsCount;       // how many of vibLevels[] are valid, starting at index 0 — used by CMD_SET_VIBRATION_ALL
};

extern QueueHandle_t commandQueue;


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
// commandQueue.ino
void initCommandQueue();
bool enqueueCommand(const Command& cmd);
void processCommandQueue();

// userProfile.ino
void initUserProfile();
void saveCurrentAsUserDefault();
void assignNewUser();

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
