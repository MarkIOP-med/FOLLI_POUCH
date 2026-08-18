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
  
  analogReadResolution(12);

  // --- CORE ---
  initValves();
  // --- PERIPHERAL ---
  initCommandQueue();  // before initBLE() — a write could arrive as soon as advertising starts
  initUserProfile();   // resets userId/assigned/savedPressure to unassigned + factory defaults (RAM only, not durable)
  initVibration();
  initFSR();
  initBLE();

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

  // --- PERIPHERAL: read auxiliary sensors, log, parse new commands into the queue ---
  // handleSerialCommands() and the BLE onWrite() callback only ever parse their own
  // wire format and enqueueCommand() — they never mutate control state directly (BLE's
  // callback runs in NimBLE's own FreeRTOS task, not this one). processCommandQueue()
  // drains everything queued so far — this tick's serial input plus any BLE writes that
  // landed since the last drain — and applies it here, on the main loop thread, before
  // runStateMachine() so it's acted on this same tick.
  readFSR();
  printSerialLog();
  handleSerialCommands();
  processCommandQueue();

  // --- CORE: drive toward targetPressure[] ---
  runStateMachine();

  // --- PERIPHERAL: apply settings, push telemetry ---
  updateVibration();
  updateBLE();
}
