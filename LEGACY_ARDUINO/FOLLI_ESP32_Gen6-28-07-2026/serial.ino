#include "config.h"

void clearSerialPort0() {
  while (Serial.available() > 0) Serial.read();
}

void handleSerialCommands() {
  if (Serial.available() > 0) {
    String incoming = Serial.readStringUntil('\n');
    incoming.trim();

    if (incoming.equalsIgnoreCase("s")) {
      currentState = STOPPED;
      Serial.println("→ System STOPPED");
      return;
    }
    if (incoming.equalsIgnoreCase("r") || incoming.equalsIgnoreCase("emergency")) {
      currentState = EMERGENCY_RELIEF;
      Serial.println("→ EMERGENCY RELIEF (immediate vent)");
      return;
    }

    // Support multiple channels separated by ';' ===
    bool hasNewTargets = false;
    String commands = incoming;
    
    // Split by semicolon
    while (commands.length() > 0) {
      int semiIndex = commands.indexOf(';');
      String part;
      
      if (semiIndex > 0) {
        part = commands.substring(0, semiIndex);
        commands = commands.substring(semiIndex + 1);
      } else {
        part = commands;
        commands = "";
      }
      
      part.trim();
      if (part.length() == 0) continue;

      int comma = part.indexOf(',');
      if (comma > 0) {
        int cell = part.substring(0, comma).toInt();
        int value = part.substring(comma + 1).toInt();
        
        if (cell >= 0 && cell < 4) {
          targetPressure[cell] = value;
          Serial.print("→ Target Ch"); Serial.print(cell);
          Serial.print(" = "); Serial.println(value);
          hasNewTargets = true;
        }
      }
    }

    if (hasNewTargets) {
      currentState = BATCH_PUMPING;   // Start batch service after new targets
    }
  }
}

void printStatusToSerial() {
  Serial.println("\n--- FOLLISAVE Gauge Pressure Status ---");
  for (int i = 0; i < 4; i++) {
    Serial.print("Ch"); Serial.print(i);
    Serial.print("  Target:"); Serial.print(targetPressure[i]);
    Serial.print("  Actual:"); Serial.print(currentPressure_gage[i], 1);
    Serial.print("  Diff:"); Serial.println(targetPressure[i] - currentPressure_gage[i], 1);
  }
  Serial.print("Manifold Gage: "); Serial.println(manifoldPressure_gage, 1);
  Serial.print("State: "); Serial.println(currentState);
  Serial.println("-----------------------------");
}
