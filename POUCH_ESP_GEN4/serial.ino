#include "config.h"

void clearSerialBuffer() {
  while (Serial.available() > 0) Serial.read();
}

void printSerialLog() {
  static bool headerPrinted = false;
  if (!headerPrinted) {
    Serial.println("time,FRN_T,FRN_A,TMP_T,TMP_A,EAR_T,EAR_A,BCK_T,BCK_A,MAN,"
                   "FSR0,FSR1,FSR2,FSR3,FSR4,FSR5,FSR6,FSR7");
    headerPrinted = true;
  }

  Serial.print(millis());                        Serial.print(',');
  for (int i = 0; i < 4; i++) {
    Serial.print(targetPressure[i]);             Serial.print(',');
    Serial.print((int)currentPressure_gage[i]);  Serial.print(',');
  }
  Serial.print((int)manifoldPressure_gage);      Serial.print(',');
  for (int i = 0; i < NUM_FSR; i++) {
    Serial.print(fsrData[i]);
    Serial.print(i < NUM_FSR - 1 ? ',' : '\n');
  }
}

void handleSerialCommands() {
  if (!Serial.available()) return;

  String incoming = Serial.readStringUntil('\n');
  incoming.trim();

  if (incoming.equalsIgnoreCase("s")) {
    currentState = STOPPED;
    Serial.println("→ System STOPPED");
    return;
  }
  if (incoming.equalsIgnoreCase("r") || incoming.equalsIgnoreCase("emergency")) {
    currentState = EMERGENCY_RELIEF;
    Serial.println("→ EMERGENCY RELIEF");
    return;
  }

  if (incoming.startsWith("vib:")) {
    String levels = incoming.substring(4);
    for (int ch = 0; ch < 4 && levels.length() > 0; ch++) {
      int comma = levels.indexOf(',');
      String part = (comma >= 0) ? levels.substring(0, comma) : levels;
      levels = (comma >= 0) ? levels.substring(comma + 1) : "";

      int level = part.toInt();
      level = constrain(level, 0, 3);
      vibrationLevel[ch] = level;
      if (level > 0) vibStartTime[ch] = millis();
    }
    Serial.println("→ Vibration levels updated");
    return;
  }

  bool hasNewTargets = false;
  String commands = incoming;

  while (commands.length() > 0) {
    int semiIdx = commands.indexOf(';');
    String part;
    if (semiIdx > 0) {
      part     = commands.substring(0, semiIdx);
      commands = commands.substring(semiIdx + 1);
    } else {
      part     = commands;
      commands = "";
    }
    part.trim();
    if (part.length() == 0) continue;

    int comma = part.indexOf(',');
    if (comma > 0) {
      int ch  = part.substring(0, comma).toInt();
      int val = part.substring(comma + 1).toInt();
      if (ch >= 0 && ch < 4) {
        targetPressure[ch] = val;
        savedPressure[ch]  = val;
        Serial.print("→ Ch"); Serial.print(ch);
        Serial.print(" = "); Serial.println(val);
        hasNewTargets = true;
      }
    }
  }

  if (hasNewTargets) {
    currentChannel = 0;
    resetChannelState();
    currentState   = PRESSURIZING;
  }
}

