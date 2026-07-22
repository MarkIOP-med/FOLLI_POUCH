/*
   ===============================================
   FOLLISAVE - FOLLI_CNTRL_Gen2
   Pneumatic Headband Pressure Controller
   ===============================================

   Serial Commands (all commands end with Enter):

   Single Channel:
     X,Y     → Set channel X to Y mmHg
             Example:  0,80     → Channel 0 to 80 mmHg
                       2,120    → Channel 2 to 120 mmHg
                       3,0      → Vent channel 3 completely
   Multiple Channels:
     X1,Y1;X2,Y2;X3,Y3
             Example:  0,60;1,30;3,0
                       2,100;3,45
   Special Commands:
     s          → Stop the system (STOPPED state)
     r          → Emergency full relief (open all valves immediately)
     emergency  → Same as r
   ===============================================
*/

#include "config.h"

void setup() {
  Serial.begin(9600);
  Serial.println("\n\n=== FOLLI_CNTRL_Gen2 - FOLLISAVE Controller ===");
  Serial.println("Initializing - Full system vent and gauge baseline capture...");
  analogReadResolution(12);
  //analogReadResolution(10);
  initValveCompressorVibration();
  Wire.begin();
  initDisplay();
  // Full vent to atmosphere + capture baseline (gauge pressure)
  reliefAllPstart();
  delay(500);
  clearSerialPort0();
  // digitalWrite(PUMP_PIN,HIGH);
  // while(1);
  currentState = IDLE;
  Serial.println("✓ System vented and gauge baseline captured successfully");
  Serial.println("Ready. Send commands like: 0,80");
}

void loop() {
  readAnalogSensors();
  updateCurrentPressures();
  handleSerialCommands();
  if (millis() - lastPrintTime > 2000) {
    printStatusToSerial();
    lastPrintTime = millis();
  }
  runStateMachine();
  updateDisplay();
}

// ====================== NON-BLOCKING STATE MACHINE ======================
void runStateMachine() {
  if (currentState == STOPPED) return;

  if (currentState == EMERGENCY_RELIEF) {
    digitalWrite(RELIEF_PIN, HIGH);
    for (int i = 0; i < 4; i++) digitalWrite(valvePins[i], HIGH);
    digitalWrite(PUMP_PIN, LOW);
    Serial.println("EMERGENCY RELIEF - All valves open");
    currentState = IDLE;
    return;
  }

  if (currentState == BATCH_PUMPING || currentState == MAINTENANCE) {
    serviceNextChannelNonBlocking();
  }
}

// ====================== NON-BLOCKING SERVICE ======================
void serviceNextChannelNonBlocking() {
  static unsigned long actionTimer = 0;
  static int phase = 0;
  static bool inAction = false;

  if (!inAction) {
    currentChannel = currentChannel % 4;
    Serial.print("→ Servicing Ch"); Serial.print(currentChannel);
    Serial.print(" Target="); Serial.println(targetPressure[currentChannel]);

    inAction = true;
    phase = 0;
    actionTimer = millis();
    return;
  }

  if (millis() - actionTimer < 30) return;

  float error = targetPressure[currentChannel] - currentPressure_gage[currentChannel];

  if (abs(error) <= PRESSURE_TOLERANCE_MMHg) {
    digitalWrite(valvePins[currentChannel], LOW);
    digitalWrite(PUMP_PIN, LOW);
    digitalWrite(RELIEF_PIN, LOW);

    Serial.print("✓ Ch"); Serial.print(currentChannel); Serial.println(" reached target");

    currentChannel++;
    inAction = false;

    if (currentChannel >= 4 && currentState == BATCH_PUMPING) {
      currentState = MAINTENANCE;
      Serial.println("Batch completed → Maintenance mode");
    }
    return;
  }

  // Pulse
  if (phase == 0) {
    if (error > 0) {  // Pump
      digitalWrite(valvePins[currentChannel], HIGH);
      digitalWrite(PUMP_PIN, HIGH);
    } else {          // Relief
      digitalWrite(RELIEF_PIN, HIGH);
    }
    phase = 1;
    actionTimer = millis();
  }
  else if (phase == 1) {
    digitalWrite(PUMP_PIN, LOW);
    digitalWrite(RELIEF_PIN, LOW);
    phase = 2;
    actionTimer = millis();
  }
  else if (phase == 2) {
    digitalWrite(valvePins[currentChannel], LOW);
    phase = 0;
    inAction = false;
    actionTimer = millis();
  }
}
