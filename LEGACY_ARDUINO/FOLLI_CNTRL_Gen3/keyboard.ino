#include "config.h"

// Full key descriptions for debug output
const char* keyDesc[NUM_KEYS] = {
  "FRONT    Line1 PAD select",
  "TEMPLE   Line1 PAD select",
  "EAR      Line1 PAD select",
  "BACK     Line1 PAD select",
  "UP       Line2 pressure+",
  "ZERO     Line2 pressure 0",
  "DOWN     Line2 pressure-",
  "VIB_0    Line3 vib off",
  "VIB_1    Line3 vib low",
  "VIB_2    Line3 vib mid",
  "VIB_3    Line3 vib high",
  "RESTORE  Line4 load saved",
  "RESET    Line4 defaults",
  "STOP     Line4 vent all",
  "SIDE_DOWN    Side ON/OFF hold",
  "SIDE_MIDDLE  Side TBD",
  "SIDE_UP      Side TBD"
};

// ledDesc indexed by physical LED position (0=first in strip)
const char* ledDesc[NUM_LEDS] = {
  "led0 VIB_3",
  "led1 VIB_2",
  "led2 VIB_1",
  "led3 VIB_0",
  "led4 FRONT",
  "led5 TEMPLE",
  "led6 EAR",
  "led7 BACK"
};

// Called after every key action — prints key info and resulting LED state
void printKeyDebug(int key) {
  Serial.println("─────────────────────────────");
  Serial.print("KEY  idx:"); Serial.print(key);
  Serial.print("  pin:"); Serial.print(kbdPins[key]);
  Serial.print("  → "); Serial.println(keyDesc[key]);

  Serial.print("LEDs on: ");
  bool any = false;

  // Line 1 LED — active PAD (look up physical index via define)
  const int padLed[4] = {LED_FRONT, LED_TEMPLE, LED_EAR, LED_BACK};
  if (selectedPad >= 0) {
    Serial.print(ledDesc[padLed[selectedPad]]);
    Serial.print("  ");
    any = true;
  }

  // Line 3 LED — active vib level (only if > 0)
  const int vibLed[4] = {LED_VIB_0, LED_VIB_1, LED_VIB_2, LED_VIB_3};
  if (selectedPad >= 0 && massageLevel[selectedPad] > 0) {
    Serial.print(ledDesc[vibLed[massageLevel[selectedPad]]]);
    Serial.print("  ");
    any = true;
  }

  if (!any) Serial.print("none");
  Serial.println();
}

// ─────────────────────────────────────────────────────────

void initKeyboard() {
  for (int i = 0; i < NUM_KEYS; i++) {
    pinMode(kbdPins[i], INPUT_PULLUP);
    kbdStatus[i]        = false;
    lastReading[i]      = HIGH;
    lastDebounceTime[i] = 0;
  }
}

void readKeyboard() {
  for (int i = 0; i < NUM_KEYS; i++) {
    bool reading = digitalRead(kbdPins[i]);
    if (reading != lastReading[i]) {
      lastDebounceTime[i] = millis();
    }
    if ((millis() - lastDebounceTime[i]) > debounceDelay) {
      bool pressed = (reading == LOW);
      if (pressed && !kbdStatus[i]) {
        kbdEventFlag   = true;
        lastKeyPressed = i;
      }
      kbdStatus[i] = pressed;
    }
    lastReading[i] = reading;
  }
}

void handleKeyEvents() {
  readKeyboard();
  if (!kbdEventFlag) return;
  kbdEventFlag = false;

  int key = lastKeyPressed;

  // Line 1 — PAD selection
  if (key >= KEY_FRONT && key <= KEY_BACK) {
    selectedPad = key;

  // Line 4 — System commands (no PAD selection required)
  } else if (key == KEY_RESTORE) {
    reliefAllPads();
    captureReferencePressure();
    for (int i = 0; i < 4; i++) targetPressure[i] = savedPressure[i];
    currentChannel = 0;
    resetChannelState();
    currentState   = PRESSURIZING;

  } else if (key == KEY_RESET) {
    reliefAllPads();
    captureReferencePressure();
    for (int i = 0; i < 4; i++) {
      targetPressure[i] = defaultPressure[i];
      savedPressure[i]  = defaultPressure[i];
    }
    currentChannel = 0;
    resetChannelState();
    currentState   = PRESSURIZING;

  } else if (key == KEY_STOP) {
    reliefAllPads();
    stopAllVibration();

  // Lines 2 and 3 — require a PAD to be selected
  } else if (selectedPad < 0) {
    Serial.println("No PAD selected — press a PAD key first");

  // Line 2 — Pressure control
  } else if (key == KEY_UP) {
    targetPressure[selectedPad] += PRESSURE_STEP_MMHG;
    savedPressure[selectedPad]   = targetPressure[selectedPad];
    currentChannel = 0;
    resetChannelState();
    currentState   = PRESSURIZING;

  } else if (key == KEY_DOWN) {
    targetPressure[selectedPad] -= PRESSURE_STEP_MMHG;
    if (targetPressure[selectedPad] < 0) targetPressure[selectedPad] = 0;
    savedPressure[selectedPad] = targetPressure[selectedPad];
    currentChannel = 0;
    resetChannelState();
    currentState   = PRESSURIZING;

  } else if (key == KEY_ZERO) {
    targetPressure[selectedPad] = 0;
    savedPressure[selectedPad]  = 0;
    digitalWrite(valvePins[selectedPad], HIGH);
    digitalWrite(RELIEF_PIN, HIGH);
    delay(500);
    digitalWrite(valvePins[selectedPad], LOW);
    digitalWrite(RELIEF_PIN, LOW);

  // Line 3 — Vibration level
  } else if (key >= KEY_VIB_0 && key <= KEY_VIB_3) {
    massageLevel[selectedPad] = key - KEY_VIB_0;
    if (massageLevel[selectedPad] > 0) vibStartTime[selectedPad] = millis();

  // Side buttons
  } else if (key == KEY_SIDE_UP) {
    // TBD
  } else if (key == KEY_SIDE_MIDDLE) {
    // TBD
  }
  // KEY_SIDE_DOWN handled exclusively by checkLongPress()

  // Always print debug after every key event
  printKeyDebug(key);
}

// ─────────────────────────────────────────────────────────

void checkLongPress() {
  bool side3Raw = (digitalRead(kbdPins[KEY_SIDE_DOWN]) == LOW);

  if (side3Raw && !side3Held) {
    side3Held      = true;
    side3PressTime = millis();
    side3LongFired = false;
  }

  if (side3Held && !side3LongFired) {
    if (millis() - side3PressTime >= (unsigned long)LONG_PRESS_MS) {
      side3LongFired = true;
      deviceOn = !deviceOn;
      if (!deviceOn) {
        stopAllVibration();
        reliefAllPads();
        currentState = STOPPED;
        Serial.println("→ Device OFF (SIDE3 long press)");
      } else {
        currentState = IDLE;
        Serial.println("→ Device ON  (SIDE3 long press)");
      }
    }
  }

  if (!side3Raw) {
    side3Held      = false;
    side3LongFired = false;
  }
}
