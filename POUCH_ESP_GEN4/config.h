#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include <SPI.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

// Two independent axes tag every variable below — see POUCH_ESP.md for the full picture:
//   CORE / PERIPHERAL   — who may touch it in code. CORE = pneumatics.ino/analogSensor.ino
//                         only (owns the pins + channel state machine). PERIPHERAL = every
//                         other file; writes shared state, never touches pins directly.
//   HARDWARE / USER-TWEAKABLE / SELF-USE — where the value comes from: fixed wiring
//                         (reflash-only), externally settable regime data, or internal
//                         control-loop state/tuning.


// ============================================================
// 1. HARDWARE — physical wiring & sensor-electrical constants
// ============================================================

// Valves / Pump / Relief pins — CORE
const int valvePins[6] = {26, 4, 13, 14, 25, 27};
// [0]=26 FRONT  [1]=4 TEMPLE  [2]=13 EAR  [3]=14 BACK  [4]=25 RELIEF  [5]=27 PUMP
#define RELIEF_PIN  valvePins[4]
#define PUMP_PIN    valvePins[5]

// Pressure sensor pins — CORE
#define NUM_SENSORS  5
#define PUMP_SENSOR  4   // index of manifold sensor in p[] / analogPressureSensorPins[]
const int analogPressureSensorPins[NUM_SENSORS] = {33, 34, 35, 36, 32};
// [0]=33 FRONT  [1]=34 TEMPLE  [2]=35 EAR  [3]=36 BACK  [4]=32 Manifold
// Verified against the physical harness on the balloon bench, 2026-08-20: the manifold
// sensor is on GPIO32 (tracks pump stall ~310 mmHg with all valves closed) and the pad
// sensors follow on 33/34/35/36 in channel order. The previously documented order
// {32,33,34,35,36} (manifold last) is wrong for this board and made "FRONT" mirror the
// manifold while the real manifold read 0, so no pad valve ever opened.

// Sensor voltage→pressure calibration curve (3.3V supply, 0–100 kPa sensor) — CORE
// A bad value here corrupts every pressure reading — reflash-only, not in SET VARIABLE.
const float Vmin     = 0.2;
const float Vmax     = 2.7;
const float Pmax_kPa = 100.0;

// Vibration motor pins — PERIPHERAL. One GPIO per V_NODE drives a coupled L/R pair.
const int vibrationPins[4] = {16, 17, 21, 22};  // FRONT, TEMPLE, EAR, BACK

// FSR pins, via MCP3008 SPI ADC — PERIPHERAL. 8 channels = 2 connectors × 4 V_NODEs.
// TODO: channel-to-connector/side mapping unconfirmed against the physical harness.
#define MCP3008_CS  5
#define NUM_FSR     8


// ============================================================
// 2. USER-TWEAKABLE — regime data, settable via Serial/BLE/(WiFi)
// ============================================================

// Live session state — PERIPHERAL writes, CORE consumes (RAM, resets each power-cycle)
int  currentTargetPressure[4] = {0, 0, 0, 0};  // live pressure target per channel (FRONT/TEMPLE/EAR/BACK)
int  vibrationLevel[4]        = {0, 0, 0, 0};  // live vibration level per channel, 0-3

// Per-user record — PERIPHERAL, RAM only (userProfile.ino). Not durable across a
// power-cycle/reflash by choice; every boot comes back unassigned. Order: FRONT=0,
// TEMPLE=1, EAR=2, BACK=3.
int systemDefaultPressure[4] = {0, 95, 125, 0};  // TEMP BENCH: FRONT/BACK zeroed — their valve paths have a physical fault (balloons don't inflate, found 2026-08-20); TEMPLE=95/EAR=125 per bench request. Real product default is {25,120,85,130}; restore once valves 0/3 are repaired.
int userDefaultPressure[4];                          // this user's saved default — RAM only

// The only per-user data on the device — vibration and thresholds are system-wide,
// same for every user (see PRESSURE_ACTUATION_THRESHOLD_MMHG below).
int  userId   = -1;     // checked-out user's id, -1 = none — RAM only
bool assigned = false;  // whether this device has a live user record — RAM only

int VIBRATION_DURATION_MS = 20000;  // ms vibration runs before auto-off — SET VARIABLE
int vibPWM[4]             = {0, 85, 170, 255};  // PWM output for vibration levels 0-3


// ============================================================
// 3. SELF-USE — internal state & control-loop tuning
// ============================================================

// State machine — CORE
enum SystemState {
  IDLE,
  PRESSURIZING,      // actively driving channels to targets
  MAINTENANCE,       // targets reached, holding pressures
  EMERGENCY_RELIEF,
  STOPPED
};
SystemState currentState = IDLE;

int   currentChannel          = 0;                    // which channel updateChannels() is servicing
float p[NUM_SENSORS];                                 // converted sensor readings, mmHg, pre-reference
float referencePressure[NUM_SENSORS] = {0};           // atmospheric baseline, captured after a full relief
float actualPressure[4]         = {0.0};              // measured pressure per channel — read-only telemetry
float actualManifoldPressure    = 0.0;                // measured manifold pressure, single scalar — read-only telemetry
uint16_t fsrData[NUM_FSR];                            // raw force-sensor reads — read-only telemetry

unsigned long vibStartTime[4]  = {0, 0, 0, 0};  // millis() when vibration last started per channel

// Control-loop tuning — CORE. Settable via SET VARIABLE.
int PRESSURE_TOLERANCE_MMHG          = 3;   // ± tolerance for "at target"
int PRESSURE_ACTUATION_THRESHOLD_MMHG = 10; // below this + target=0, a channel is skipped rather than actuated

// Planned, not implemented — a per-user bound on how far a user may adjust off their
// saved default. Distinct from PRESSURE_ACTUATION_THRESHOLD_MMHG above; don't confuse
// the two if this gets built.
//   int pressureThreshold[4];  // system-wide, admin-gated

// Valve/pump timing — CORE. const, not in SET VARIABLE (higher-risk to change live).
const unsigned long CHANNEL_PHASE_TICK_MS   = 30;    // min time between updateChannels() phase advances
const unsigned long RELIEF_VENT_DURATION_MS = 1000;  // how long relief+valves stay open during a full vent
const unsigned long STARTUP_SETTLE_MS       = 150;   // settle time after startup vent, before capturing reference

// Sensor oversampling — CORE. const, not in SET VARIABLE.
const int overSampling       = 4;
const int overSamplingDelay  = 5;    // ms between oversampling cycles
const int sensorDelayMeasur  = 50;   // µs between sensors in one cycle

int TELEMETRY_INTERVAL_MS = 250;  // BLE telemetry push cadence, ms — PERIPHERAL, SET VARIABLE

const int SERIAL_LOG_INTERVAL_MS = 200;  // serial CSV telemetry cadence, ms — PERIPHERAL. Was every loop; see printSerialLog() for why that broke pressure control.


// ============================================================
// 4. COMMAND QUEUE — cross-cutting infrastructure, not itself data
// ============================================================
// Every transport shares one text grammar (commandParser.ino) and one queue. loop()
// drains it once per tick, before runStateMachine(), so BLE's onWrite() — which runs on
// NimBLE's own FreeRTOS task — can't race the control loop. Full grammar and response
// format: POUCH_ESP.md.

enum CommandType {
  CMD_START,                     // "start"
  CMD_STOP,                      // "stop"
  CMD_RESET_ALL,                 // "resetall"
  CMD_RESTART,                   // "restart"
  CMD_USER_ID,                   // "user:<id>:<p0>,<p1>,<p2>,<p3>"
  CMD_ASSIGN_NEW_USER,           // "assign"
  CMD_SET_TARGET,                // "setpressure:..." — vector or channel,value; see commandParser.ino
  CMD_SAVE_AS_DEFAULT,           // "saveasdefault"
  CMD_SET_USER_DEFAULT_PRESSURE, // "setuserdefaultpressure:<p0>,<p1>,<p2>,<p3>"
  CMD_SET_VIBRATION_ALL,         // "setvibration:<L0>,<L1>,<L2>,<L3>"
  CMD_SET_VARIABLE,              // "setvariable:<NAME>,<VALUE|default>"

  // READ commands — no payload, response comes back tagged "R:..." via sendResponse()
  CMD_READ_PRESSURE,             // "readpressure"
  CMD_READ_FSR,                  // "readfsr"
  CMD_READ_VARIABLES,            // "readvariables"
  CMD_READ_USER,                 // "readuser"
  CMD_READ_STATE,                // "readstate"
  CMD_READ_VIBRATION,            // "readvibration"
  CMD_READ_ALL                   // "readall"
};

enum CommandSource { SRC_SERIAL, SRC_BLE };  // SRC_WIFI to be added when WiFi lands

struct Command {
  CommandType   type;
  CommandSource source;
  int  channel;         // 0-3 — CMD_SET_TARGET
  int  pressure;        // CMD_SET_TARGET
  int  pressures[4];    // CMD_USER_ID, CMD_SET_USER_DEFAULT_PRESSURE
  int  vibLevels[4];    // CMD_SET_VIBRATION_ALL
  int  vibLevelsCount;  // how many of vibLevels[] are valid — CMD_SET_VIBRATION_ALL
  int  userIdValue;     // CMD_USER_ID
  char varName[20];     // CMD_SET_VARIABLE — fixed-size, not Arduino String (struct is memcpy'd through the queue)
  int  varValue;        // CMD_SET_VARIABLE
  bool varIsDefault;    // CMD_SET_VARIABLE — true = reset to compiled default, varValue ignored
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
void sendResponse(CommandSource source, const String& line);

// commandParser.ino
void parseCommandString(String incoming, CommandSource source);

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
void sendBLEResponse(const String& line);

#endif
