#include "config.h"

// Central dispatch for every command that changes control state, regardless of which
// transport it arrived on. commandParser.ino only ever parses text and enqueueCommand()
// — everything below is the one place that actually mutates
// currentTargetPressure[]/userDefaultPressure[]/vibrationLevel[]/currentState/etc., so
// the logic isn't duplicated per transport and can't be applied out of order relative
// to the control loop.

QueueHandle_t commandQueue = nullptr;

void initCommandQueue() {
  commandQueue = xQueueCreate(16, sizeof(Command));
}

bool enqueueCommand(const Command& cmd) {
  if (commandQueue == nullptr) return false;
  if (xQueueSend(commandQueue, &cmd, 0) != pdTRUE) {
    sendResponse(cmd.source, "ERR:QUEUE_FULL:command dropped");
    return false;
  }
  return true;
}

// Every response — telemetry excluded, that's periodic and unprompted — flows through
// here. Always echoed to Serial (the developer's window into everything, regardless of
// which transport triggered it); additionally pushed over BLE notify if that's where
// the request came from, since a BLE caller has no other way to see it.
void sendResponse(CommandSource source, const String& line) {
  Serial.println(line);
  if (source == SRC_BLE) {
    sendBLEResponse(line);
  }
}

// --- START ---
static void applyStart() {
  reliefAllPads();
  captureReferencePressure();
  for (int i = 0; i < 4; i++) currentTargetPressure[i] = userDefaultPressure[i];
  currentChannel = 0;
  resetChannelState();
  currentState = PRESSURIZING;
  sessionStartMs = millis();   // fresh session, fresh clock
}

// --- STOP --- stop vibration + vent all to zero. Venting happens this same tick:
// runStateMachine() (called right after processCommandQueue() in loop()) sees
// EMERGENCY_RELIEF and calls reliefAllPads() before the tick ends.
static void applyStop() {
  stopAllVibration();
  currentState = EMERGENCY_RELIEF;
}

// --- RESET ALL --- pressure AND identity back to factory state
static void applyResetAll() {
  reliefAllPads();
  captureReferencePressure();
  for (int i = 0; i < 4; i++) {
    currentTargetPressure[i] = systemDefaultPressure[i];
    userDefaultPressure[i]   = systemDefaultPressure[i];
  }
  userId   = -1;
  assigned = false;
  userName[0] = '\0';
  currentChannel = 0;
  resetChannelState();
  currentState = PRESSURIZING;
  sessionStartMs = millis();   // fresh session, fresh clock
}

// --- RESTART --- re-init the control loop only; identity/regime untouched
static void applyRestart() {
  reliefAllPads();
  captureReferencePressure();
}

// --- USER_ID --- load a specific known user: id + full regime (+ display name) pushed together
static void applyUserId(int id, const int* pressures, const char* name) {
  userId   = id;
  assigned = true;
  for (int i = 0; i < 4; i++) userDefaultPressure[i] = pressures[i];
  strncpy(userName, name, USER_NAME_MAX);
  userName[USER_NAME_MAX] = '\0';
}

// --- SET PRESSURE --- one channel
static void applySetTarget(int channel, int pressure) {
  if (channel < 0 || channel > 3) return;
  currentTargetPressure[channel] = pressure;
  currentChannel = 0;
  resetChannelState();
  currentState = PRESSURIZING;
  // Mid-session target edits keep the running clock; only a cold start sets it.
  if (sessionStartMs == 0) sessionStartMs = millis();
}

// --- SET VIBRATION --- level -1 = leave that channel as it is (running or not),
// so triggering one zone doesn't stop another mid-run.
static void applySetVibrationAll(const int* levels, int count) {
  for (int ch = 0; ch < count && ch < 4; ch++) {
    if (levels[ch] < 0) continue;
    vibrationLevel[ch] = levels[ch];
    if (levels[ch] > 0) vibStartTime[ch] = millis();
  }
}

// --- SET VARIABLE --- starter registry: only already-mutable, low-risk tuning
// constants. Deliberately excludes sensor calibration (Vmin/Vmax/Pmax_kPa) and
// valve/pump timing — both are `const` and flagged in POUCH_ESP.md as needing a
// stricter service/calibration access tier before being made runtime-settable at all.
static bool applySetVariable(const String& name, int value, bool useDefault) {
  if (name.equalsIgnoreCase("PRESSURE_TOLERANCE")) {
    PRESSURE_TOLERANCE_MMHG = useDefault ? 3 : value;
  } else if (name.equalsIgnoreCase("ACTUATION_THRESHOLD")) {
    PRESSURE_ACTUATION_THRESHOLD_MMHG = useDefault ? 10 : value;
  } else if (name.equalsIgnoreCase("VIBRATION_DURATION")) {
    VIBRATION_DURATION_MS = useDefault ? 20000 : value;
  } else if (name.equalsIgnoreCase("TELEMETRY_INTERVAL")) {
    TELEMETRY_INTERVAL_MS = useDefault ? 250 : value;
  } else {
    return false;
  }
  return true;
}

// --- READ helpers --- each builds its "CATEGORY:payload" fragment (no "R:" prefix,
// so READ ALL can concatenate them); individual READ commands prepend "R:" themselves.

static const char* stateTag(SystemState s) {
  switch (s) {
    case IDLE:             return "IDLE";
    case PRESSURIZING:     return "PRESSURIZING";
    case MAINTENANCE:      return "MAINTENANCE";
    case EMERGENCY_RELIEF: return "EMERGENCY_RELIEF";
    case STOPPED:          return "STOPPED";
  }
  return "UNKNOWN";
}

static String buildPressureFragment() {
  String s = "PRESSURE:";
  for (int i = 0; i < 4; i++) { s += (int)actualPressure[i]; s += ","; }
  s += (int)actualManifoldPressure;
  for (int i = 0; i < 4; i++) { s += ","; s += currentTargetPressure[i]; }
  return s;
}

static String buildFsrFragment() {
  String s = "FSR:";
  for (int i = 0; i < NUM_FSR; i++) {
    s += fsrData[i];
    if (i < NUM_FSR - 1) s += ",";
  }
  return s;
}

static String buildVariablesFragment() {
  return "VARIABLES:PRESSURE_TOLERANCE=" + String(PRESSURE_TOLERANCE_MMHG) +
         ",ACTUATION_THRESHOLD=" + String(PRESSURE_ACTUATION_THRESHOLD_MMHG) +
         ",VIBRATION_DURATION=" + String(VIBRATION_DURATION_MS) +
         ",TELEMETRY_INTERVAL=" + String(TELEMETRY_INTERVAL_MS);
}

// USER:<id>,<assigned>,<p0>,<p1>,<p2>,<p3>,<name> — the name is the LAST field and
// free text, so decoders take everything after the sixth comma as the name.
static String buildUserFragment() {
  String s = "USER:" + String(userId) + "," + String(assigned ? "true" : "false");
  for (int i = 0; i < 4; i++) { s += ","; s += userDefaultPressure[i]; }
  s += ",";
  s += userName;
  return s;
}

// The user record changed (checkout from the operator app, or RESET ALL). The BLE
// console mirrors that record, so tell it unprompted — the same R:USER line it would
// get from readuser — whenever the change came from the OTHER transport. The BLE
// caller itself already received the OK and re-reads on its own.
static void announceUserRecord(CommandSource changedBy) {
  if (changedBy != SRC_BLE) sendBLEResponse("R:" + buildUserFragment());
}

static String buildStateFragment() {
  return String("STATE:") + stateTag(currentState);
}

static String buildVibrationFragment() {
  String s = "VIBRATION:";
  for (int i = 0; i < 4; i++) {
    s += vibrationLevel[i];
    if (i < 3) s += ",";
  }
  return s;
}

static void dispatchCommand(const Command& cmd) {
  switch (cmd.type) {
    case CMD_START:
      // The patient console may only run a clinician-assigned regime. The factory
      // defaults are a bench convenience for the serial operator, never a treatment —
      // and the user record is RAM-only, so every power-cycle lands here until the
      // operator re-assigns.
      if (cmd.source == SRC_BLE && !assigned) {
        sendResponse(cmd.source, "ERR:START:NO_USER_ASSIGNED");
        break;
      }
      applyStart();
      sendResponse(cmd.source, "OK:START");
      break;

    case CMD_STOP:
      applyStop();
      sendResponse(cmd.source, "OK:STOP");
      break;

    case CMD_RESET_ALL:
      applyResetAll();
      sendResponse(cmd.source, "OK:RESETALL");
      announceUserRecord(cmd.source);
      break;

    case CMD_RESTART:
      applyRestart();
      sendResponse(cmd.source, "OK:RESTART");
      break;

    case CMD_USER_ID:
      applyUserId(cmd.userIdValue, cmd.pressures, cmd.userName);
      sendResponse(cmd.source, "OK:USER:" + String(cmd.userIdValue));
      announceUserRecord(cmd.source);
      break;

    case CMD_ASSIGN_NEW_USER:
      assignNewUser();
      sendResponse(cmd.source, "OK:ASSIGN:" + String(userId));
      break;

    case CMD_SET_TARGET:
      applySetTarget(cmd.channel, cmd.pressure);
      sendResponse(cmd.source, "OK:SETPRESSURE:" + String(cmd.channel) + "," + String(cmd.pressure));
      break;

    case CMD_SAVE_AS_DEFAULT:
      saveCurrentAsUserDefault();
      sendResponse(cmd.source, "OK:SAVEASDEFAULT");
      break;

    case CMD_SET_USER_DEFAULT_PRESSURE:
      for (int i = 0; i < 4; i++) userDefaultPressure[i] = cmd.pressures[i];
      sendResponse(cmd.source, "OK:SETUSERDEFAULTPRESSURE");
      break;

    case CMD_SET_VIBRATION_ALL:
      applySetVibrationAll(cmd.vibLevels, cmd.vibLevelsCount);
      sendResponse(cmd.source, "OK:SETVIBRATION");
      break;

    case CMD_SET_VARIABLE: {
      String name(cmd.varName);
      if (applySetVariable(name, cmd.varValue, cmd.varIsDefault)) {
        sendResponse(cmd.source, "OK:SETVARIABLE:" + name);
      } else {
        sendResponse(cmd.source, "ERR:SETVARIABLE:unknown variable " + name);
      }
      break;
    }

    case CMD_READ_PRESSURE:
      sendResponse(cmd.source, "R:" + buildPressureFragment());
      break;

    case CMD_READ_FSR:
      sendResponse(cmd.source, "R:" + buildFsrFragment());
      break;

    case CMD_READ_VARIABLES:
      sendResponse(cmd.source, "R:" + buildVariablesFragment());
      break;

    case CMD_READ_USER:
      sendResponse(cmd.source, "R:" + buildUserFragment());
      break;

    case CMD_READ_STATE:
      sendResponse(cmd.source, "R:" + buildStateFragment());
      break;

    case CMD_READ_VIBRATION:
      sendResponse(cmd.source, "R:" + buildVibrationFragment());
      break;

    case CMD_READ_ALL:
      sendResponse(cmd.source, "R:" + buildPressureFragment() + ";" + buildFsrFragment() + ";" +
                                buildVariablesFragment() + ";" + buildUserFragment() + ";" +
                                buildStateFragment() + ";" + buildVibrationFragment());
      break;
  }
}

void processCommandQueue() {
  Command cmd;
  while (xQueueReceive(commandQueue, &cmd, 0) == pdTRUE) {
    dispatchCommand(cmd);
  }
}
