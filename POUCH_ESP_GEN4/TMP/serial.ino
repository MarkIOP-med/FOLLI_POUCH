#include "config.h"

void clearSerialBuffer() {
  while (Serial.available() > 0) Serial.read();
}

void printSerialLog() {
  static bool headerPrinted = false;
  if (!headerPrinted) {
    Serial.println("time,FRN_T,FRN_A,TMP_T,TMP_A,EAR_T,EAR_A,BCK_T,BCK_A,MAN,"
                   "FSR_FRN_L,FSR_FRN_R,FSR_TMP_L,FSR_TMP_R,FSR_EAR_L,FSR_EAR_R,FSR_BCK_L,FSR_BCK_R");
    headerPrinted = true;
  }

  Serial.print(millis());                        Serial.print(',');
  for (int i = 0; i < 4; i++) {
    Serial.print(targetPressure[i]);             Serial.print(',');
    Serial.print((int)currentPressure_gage[i]);  Serial.print(',');
  }
  Serial.print((int)manifoldPressure_gage);      Serial.print(',');
  Serial.print(analogRead(fsrPins[0]));          Serial.print(',');  // FSR_FRN_L
  Serial.print(analogRead(fsrPins[1]));          Serial.print(',');  // FSR_FRN_R
  Serial.print(analogRead(fsrPins[2]));          Serial.print(',');  // FSR_TMP_L
  Serial.print(analogRead(fsrPins[3]));          Serial.print(',');  // FSR_TMP_R
  Serial.print(0);                               Serial.print(',');  // FSR_EAR_L (not implemented)
  Serial.print(0);                               Serial.print(',');  // FSR_EAR_R (not implemented)
  Serial.print(analogRead(fsrPins[4]));          Serial.print(',');  // FSR_BCK_L
  Serial.println(analogRead(fsrPins[5]));                            // FSR_BCK_R
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

