/*
   ===============================================
   FOLLISAVE - FOLLI_CNTRL_Gen3
   Pneumatic Headband Pressure Controller

   Serial Commands:
     X,Y              → Set channel X to Y mmHg  (e.g. 0,80)
     X1,Y1;X2,Y2;...  → Set multiple channels
     s                → Stop system
     r / emergency    → Emergency relief all PADs

   Control Unit:
     Line 1  [FRONT][TEMPLE][EAR][BACK]  — PAD selection
     Line 2  [UP][ZERO][DOWN]            — Pressure control for selected PAD
     Line 3  [VIB0][VIB1][VIB2][VIB3]   — Vibration level for selected PAD
     Line 4  [RESTORE][RESET][STOP]      — System commands
     Side    [SIDE1][SIDE2][SIDE3↓hold]  — SIDE3 long press = ON/OFF
   ===============================================
*/

#include "config.h"

void setup() {
  Serial.begin(9600);
  Serial.println("\n\n=== FOLLI_CNTRL_Gen3 - FOLLISAVE Controller ===");
  Serial.println("Initializing...");

  analogReadResolution(12);

  initValves();
  initVibration();
  Wire.begin();
  initDisplay();
  initLeds();
  initKeyboard();

  for (int i = 0; i < 4; i++) savedPressure[i] = defaultPressure[i];

  reliefStartup();
  delay(500);
  captureReferencePressure();
  clearSerialBuffer();

  currentState = IDLE;
  Serial.println("Ready. No pressure applied.");
  Serial.println("Press RESET or RESTORE on control unit to apply pressures.");
}

void loop() {
  readAnalogSensors();
  updateCurrentPressures();
  printSerialLog();
  handleSerialCommands();
  handleKeyEvents();
  checkLongPress();
  runStateMachine();
  updateVibration();
  updateLeds();
  updateDisplay();
}
