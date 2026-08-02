/*
   ===============================================
   FOLLISAVE - FOLLI_CNTRL_Gen6
   Pneumatic Headband Pressure Controller (ESP32)

   Serial Commands:
     X,Y              → Set channel X to Y mmHg  (e.g. 0,80)
     X1,Y1;X2,Y2;...  → Set multiple channels
     s                → Stop system
     r / emergency    → Emergency relief all PADs

   No onboard keyboard/LEDs/display on this hardware revision — control and
   status live in the CONSOLE app over BLE (see ble.ino and
   FOLLI_CONSOLE/FOLLI_COMSOLE_OVERVIEW.md) plus a POUCH_DIAGNOSTICS
   serial/WiFi stream (planned, not yet implemented).
   ===============================================
*/

#include "config.h"

void setup() {
  Serial.begin(9600);
  Serial.println("\n\n=== FOLLI_CNTRL_Gen6 - FOLLISAVE Controller ===");
  Serial.println("Initializing...");

  analogReadResolution(12);

  // --- CORE ---
  initValves();
  // --- PERIPHERAL ---
  initVibration();
  initFSR();
  initBLE();

  for (int i = 0; i < 4; i++) savedPressure[i] = defaultPressure[i];

  reliefStartup();
  delay(500);
  captureReferencePressure();
  clearSerialBuffer();

  currentState = IDLE;
  Serial.println("Ready. No pressure applied.");
}

void loop() {
  // --- CORE: sense current pressures ---
  readAnalogSensors();
  updateCurrentPressures();

  // --- PERIPHERAL: read auxiliary sensors, log, take new targets from the outside world ---
  // (handleSerialCommands() runs before runStateMachine() so a command that changes
  // targetPressure[] this tick is acted on this tick, not next loop(); BLE command
  // writes land asynchronously via the NimBLE callback regardless of updateBLE()'s
  // position here, so it isn't time-sensitive the same way.)
  readFSR();
  printSerialLog();
  handleSerialCommands();

  // --- CORE: drive toward targetPressure[] ---
  runStateMachine();

  // --- PERIPHERAL: apply settings, push telemetry ---
  updateVibration();
  updateBLE();
}
