/*
   FOLLISAVE - FOLLI_CNTRL_Gen6
   Pneumatic Headband Pressure Controller (ESP32)

   Full architecture, protocol, and command reference: POUCH_ESP.md
*/

#include "config.h"

void setup() {
  Serial.begin(9600);
  
  analogReadResolution(12);

  // --- CORE ---
  initValves();
  // --- PERIPHERAL ---
  initCommandQueue();  // before initBLE() — a write could arrive as soon as advertising starts
  initUserProfile();   // resets userId/assigned/userDefaultPressure to unassigned + factory defaults (RAM only, not durable)
  initVibration();
  initFSR();
  initBLE();

  reliefStartup();               // vent to a known state before establishing the pressure baseline
  delay(500);                    // let residual pressure settle before capturing reference
  captureReferencePressure();    // baseline = "zero" for this board's sensors
  clearSerialBuffer();           // discard anything that arrived during the ~1.5s vent/settle above

  currentState = IDLE;
  Serial.println("Ready. No pressure applied.");
}

void loop() {
  // --- CORE: sense current pressures ---
  readAnalogSensors();
  updateCurrentPressures();

  // --- PERIPHERAL: read auxiliary sensors, log, parse commands ---
  readFSR();
  printSerialLog();
  handleSerialCommands();      // parses serial into the queue — never mutates state directly
  processCommandQueue();       // drains queue (this tick's serial + any BLE since last drain), applies it here

  // --- CORE: drive toward currentTargetPressure[] ---
  runStateMachine();

  // --- PERIPHERAL: apply settings, push telemetry ---
  updateVibration();
  updateBLE();
}
