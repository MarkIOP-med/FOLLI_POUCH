#include "config.h"

// Shared text-command grammar used by every transport (serial.ino, ble.ino, wifi.ino
// later) — one parser, so behavior can't drift between channels the way serial and
// BLE once did for "emergency". Each transport reads its own raw bytes and hands the
// resulting line to parseCommandString(); this file only ever builds Command(s) and
// calls enqueueCommand() — it never touches control state itself. Parse errors are
// reported via sendResponse() (tagged "ERR:...") so the caller — Serial or BLE — sees
// them, not just whoever happens to be watching the Serial monitor.
//
// Grammar: bare lowercase word for no-payload commands, "word:payload" for commands
// that take data, ';'-separated for the one command that batches (setpressure).

static int parseIntList(String s, int* out, int maxCount) {
  int count = 0;
  while (s.length() > 0 && count < maxCount) {
    int comma = s.indexOf(',');
    String part = (comma >= 0) ? s.substring(0, comma) : s;
    s = (comma >= 0) ? s.substring(comma + 1) : "";
    out[count++] = part.toInt();
  }
  return count;
}

void parseCommandString(String incoming, CommandSource source) {
  incoming.trim();
  if (incoming.length() == 0) return;

  int colon   = incoming.indexOf(':');
  String word = (colon >= 0) ? incoming.substring(0, colon) : incoming;
  String rest = (colon >= 0) ? incoming.substring(colon + 1) : "";
  word.trim();

  Command cmd = {};
  cmd.source = source;

  if (word.equalsIgnoreCase("start")) {
    cmd.type = CMD_START;
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("stop")) {
    cmd.type = CMD_STOP;
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("resetall")) {
    cmd.type = CMD_RESET_ALL;
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("restart")) {
    cmd.type = CMD_RESTART;
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("assign")) {
    cmd.type = CMD_ASSIGN_NEW_USER;
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("saveasdefault")) {
    cmd.type = CMD_SAVE_AS_DEFAULT;
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("readpressure")) {
    cmd.type = CMD_READ_PRESSURE;
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("readfsr")) {
    cmd.type = CMD_READ_FSR;
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("readvariables")) {
    cmd.type = CMD_READ_VARIABLES;
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("readuser")) {
    cmd.type = CMD_READ_USER;
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("readstate")) {
    cmd.type = CMD_READ_STATE;
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("readvibration")) {
    cmd.type = CMD_READ_VIBRATION;
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("readall")) {
    cmd.type = CMD_READ_ALL;
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("user")) {
    // user:<id>:<p0>,<p1>,<p2>,<p3>
    int colon2 = rest.indexOf(':');
    if (colon2 < 0) {
      sendResponse(source, "ERR:USER:expected user:<id>:<p0>,<p1>,<p2>,<p3>");
      return;
    }
    cmd.type = CMD_USER_ID;
    cmd.userIdValue = rest.substring(0, colon2).toInt();
    String pressures = rest.substring(colon2 + 1);
    if (parseIntList(pressures, cmd.pressures, 4) != 4) {
      sendResponse(source, "ERR:USER:needs exactly 4 pressure values");
      return;
    }
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("setpressure")) {
    // setpressure:<ch>,<val>;<ch>,<val>;... — one channel at a time, ';'-batchable
    bool any = false;
    while (rest.length() > 0) {
      int semi = rest.indexOf(';');
      String part = (semi >= 0) ? rest.substring(0, semi) : rest;
      rest = (semi >= 0) ? rest.substring(semi + 1) : "";
      part.trim();
      if (part.length() == 0) continue;

      int comma = part.indexOf(',');
      if (comma <= 0) {
        sendResponse(source, "ERR:SETPRESSURE:malformed pair '" + part + "'");
        continue;
      }
      int ch  = part.substring(0, comma).toInt();
      int val = part.substring(comma + 1).toInt();
      if (ch < 0 || ch > 3) {
        sendResponse(source, "ERR:SETPRESSURE:channel out of range (" + String(ch) + ")");
        continue;
      }

      Command c = {};
      c.source   = source;
      c.type     = CMD_SET_TARGET;
      c.channel  = ch;
      c.pressure = val;
      enqueueCommand(c);
      any = true;
    }
    if (!any) sendResponse(source, "ERR:SETPRESSURE:no valid channel,value pairs");

  } else if (word.equalsIgnoreCase("setuserdefaultpressure")) {
    cmd.type = CMD_SET_USER_DEFAULT_PRESSURE;
    if (parseIntList(rest, cmd.pressures, 4) != 4) {
      sendResponse(source, "ERR:SETUSERDEFAULTPRESSURE:needs exactly 4 values");
      return;
    }
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("setvibration")) {
    cmd.type = CMD_SET_VIBRATION_ALL;
    cmd.vibLevelsCount = parseIntList(rest, cmd.vibLevels, 4);
    if (cmd.vibLevelsCount == 0) {
      sendResponse(source, "ERR:SETVIBRATION:no values given");
      return;
    }
    for (int i = 0; i < cmd.vibLevelsCount; i++) {
      cmd.vibLevels[i] = constrain(cmd.vibLevels[i], 0, 3);
    }
    enqueueCommand(cmd);

  } else if (word.equalsIgnoreCase("setvariable")) {
    // setvariable:<NAME>,<VALUE|default>
    int comma = rest.indexOf(',');
    if (comma < 0) {
      sendResponse(source, "ERR:SETVARIABLE:expected setvariable:<NAME>,<VALUE|default>");
      return;
    }
    String name  = rest.substring(0, comma);
    String value = rest.substring(comma + 1);
    name.trim();
    value.trim();

    cmd.type = CMD_SET_VARIABLE;
    name.toCharArray(cmd.varName, sizeof(cmd.varName));
    cmd.varIsDefault = value.equalsIgnoreCase("default");
    cmd.varValue = cmd.varIsDefault ? 0 : value.toInt();
    enqueueCommand(cmd);

  } else {
    sendResponse(source, "ERR:UNKNOWN:" + incoming);
  }
}
