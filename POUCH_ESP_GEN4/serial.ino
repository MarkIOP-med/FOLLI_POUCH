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
    Command cmd = {};
    cmd.type   = CMD_STOP;
    cmd.source = SRC_SERIAL;
    enqueueCommand(cmd);
    return;
  }
  if (incoming.equalsIgnoreCase("r") || incoming.equalsIgnoreCase("emergency")) {
    Command cmd = {};
    cmd.type   = CMD_EMERGENCY;
    cmd.source = SRC_SERIAL;
    enqueueCommand(cmd);
    return;
  }
  if (incoming.equalsIgnoreCase("save")) {
    Command cmd = {};
    cmd.type   = CMD_SAVE_AS_DEFAULT;
    cmd.source = SRC_SERIAL;
    enqueueCommand(cmd);
    return;
  }
  if (incoming.equalsIgnoreCase("assign")) {
    Command cmd = {};
    cmd.type   = CMD_ASSIGN_NEW_USER;
    cmd.source = SRC_SERIAL;
    enqueueCommand(cmd);
    return;
  }
  if (incoming.equalsIgnoreCase("restore")) {
    Command cmd = {};
    cmd.type   = CMD_RESTORE;
    cmd.source = SRC_SERIAL;
    enqueueCommand(cmd);
    return;
  }
  if (incoming.equalsIgnoreCase("reset")) {
    Command cmd = {};
    cmd.type   = CMD_RESET;
    cmd.source = SRC_SERIAL;
    enqueueCommand(cmd);
    return;
  }
  if (incoming.equalsIgnoreCase("on")) {
    Command cmd = {};
    cmd.type   = CMD_DEVICE_ON;
    cmd.source = SRC_SERIAL;
    enqueueCommand(cmd);
    return;
  }
  if (incoming.equalsIgnoreCase("off")) {
    Command cmd = {};
    cmd.type   = CMD_DEVICE_OFF;
    cmd.source = SRC_SERIAL;
    enqueueCommand(cmd);
    return;
  }

  if (incoming.startsWith("vib:")) {
    Command cmd = {};
    cmd.type   = CMD_SET_VIBRATION_ALL;
    cmd.source = SRC_SERIAL;

    String levels = incoming.substring(4);
    int count = 0;
    for (int ch = 0; ch < 4 && levels.length() > 0; ch++) {
      int comma = levels.indexOf(',');
      String part = (comma >= 0) ? levels.substring(0, comma) : levels;
      levels = (comma >= 0) ? levels.substring(comma + 1) : "";

      int level = constrain(part.toInt(), 0, 3);
      cmd.vibLevels[ch] = level;
      count++;
    }
    cmd.vibLevelsCount = count;
    enqueueCommand(cmd);
    return;
  }

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
        Command cmd = {};
        cmd.type     = CMD_SET_TARGET;
        cmd.source   = SRC_SERIAL;
        cmd.channel  = ch;
        cmd.pressure = val;
        cmd.vibLevel = -1;  // serial X,Y never touches vibration
        enqueueCommand(cmd);
      }
    }
  }
}

