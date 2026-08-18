#include "config.h"

// Central dispatch for every command that changes control state, regardless of which
// transport it arrived on. serial.ino and ble.ino only ever parse their own wire format
// and enqueueCommand() — everything below is the one place that actually mutates
// targetPressure[]/vibrationLevel[]/currentState/etc., so the logic isn't duplicated
// per transport and can't be applied out of order relative to the control loop.

QueueHandle_t commandQueue = nullptr;

void initCommandQueue() {
  commandQueue = xQueueCreate(16, sizeof(Command));
}

bool enqueueCommand(const Command& cmd) {
  if (commandQueue == nullptr) return false;
  if (xQueueSend(commandQueue, &cmd, 0) != pdTRUE) {
    Serial.println("! Command queue full, command dropped");
    return false;
  }
  return true;
}

static const char* sourceTag(CommandSource src) {
  return (src == SRC_BLE) ? "BLE" : "Serial";
}

static void applySetTarget(int channel, int pressure, int vibLevel) {
  if (channel < 0 || channel > 3) return;
  targetPressure[channel] = pressure;
  savedPressure[channel]  = pressure;
  if (vibLevel >= 0) {
    vibrationLevel[channel] = vibLevel;
    if (vibLevel > 0) vibStartTime[channel] = millis();
  }
  currentChannel = 0;
  resetChannelState();
  currentState = PRESSURIZING;
}

static void applySetVibrationAll(const int* levels, int count) {
  for (int ch = 0; ch < count && ch < 4; ch++) {
    vibrationLevel[ch] = levels[ch];
    if (levels[ch] > 0) vibStartTime[ch] = millis();
  }
}

static void applyRestore() {
  reliefAllPads();
  captureReferencePressure();
  for (int i = 0; i < 4; i++) targetPressure[i] = savedPressure[i];
  currentChannel = 0;
  resetChannelState();
  currentState = PRESSURIZING;
}

static void applyReset() {
  reliefAllPads();
  captureReferencePressure();
  for (int i = 0; i < 4; i++) {
    targetPressure[i] = defaultPressure[i];
    savedPressure[i]  = defaultPressure[i];
  }
  currentChannel = 0;
  resetChannelState();
  currentState = PRESSURIZING;
}

static void applyDeviceOff() {
  deviceOn = false;
  stopAllVibration();
  reliefAllPads();
  currentState = STOPPED;
}

static void applyDeviceOn() {
  deviceOn     = true;
  currentState = IDLE;
}

static void dispatchCommand(const Command& cmd) {
  switch (cmd.type) {
    case CMD_SET_TARGET:
      applySetTarget(cmd.channel, cmd.pressure, cmd.vibLevel);
      Serial.print(sourceTag(cmd.source)); Serial.print(" -> Ch"); Serial.print(cmd.channel);
      Serial.print(" = "); Serial.println(cmd.pressure);
      break;

    case CMD_SET_VIBRATION_ALL:
      applySetVibrationAll(cmd.vibLevels, cmd.vibLevelsCount);
      Serial.print(sourceTag(cmd.source)); Serial.println(" -> Vibration levels updated");
      break;

    case CMD_STOP:
      currentState = STOPPED;
      Serial.print(sourceTag(cmd.source)); Serial.println(" -> System STOPPED");
      break;

    case CMD_EMERGENCY:
      // Stopping vibration is part of "emergency" regardless of source — previously
      // only the BLE path did this; unified here since an emergency should always
      // stop everything. Venting happens this same tick: runStateMachine() (called
      // right after processCommandQueue() in loop()) sees EMERGENCY_RELIEF and calls
      // reliefAllPads() before the tick ends.
      stopAllVibration();
      currentState = EMERGENCY_RELIEF;
      Serial.print(sourceTag(cmd.source)); Serial.println(" -> EMERGENCY RELIEF");
      break;

    case CMD_RESTORE:
      applyRestore();
      Serial.print(sourceTag(cmd.source)); Serial.println(" -> RESTORE");
      break;

    case CMD_RESET:
      applyReset();
      Serial.print(sourceTag(cmd.source)); Serial.println(" -> RESET");
      break;

    case CMD_DEVICE_OFF:
      applyDeviceOff();
      Serial.print(sourceTag(cmd.source)); Serial.println(" -> DEVICE OFF");
      break;

    case CMD_DEVICE_ON:
      applyDeviceOn();
      Serial.print(sourceTag(cmd.source)); Serial.println(" -> DEVICE ON");
      break;

    case CMD_SAVE_AS_DEFAULT:
      saveCurrentAsUserDefault();
      Serial.print(sourceTag(cmd.source)); Serial.println(" -> SAVE AS DEFAULT");
      break;

    case CMD_ASSIGN_NEW_USER:
      assignNewUser();
      Serial.print(sourceTag(cmd.source)); Serial.println(" -> ASSIGN NEW USER");
      break;
  }
}

void processCommandQueue() {
  Command cmd;
  while (xQueueReceive(commandQueue, &cmd, 0) == pdTRUE) {
    dispatchCommand(cmd);
  }
}
