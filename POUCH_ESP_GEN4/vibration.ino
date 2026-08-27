#include "config.h"

void initVibration() {
  for (int i = 0; i < 4; i++) {
    pinMode(vibrationPins[i], OUTPUT);
    analogWrite(vibrationPins[i], 0);
  }
}

void updateVibration() {
  for (int i = 0; i < 4; i++) {
    if (vibrationLevel[i] > 0 &&
        millis() - vibStartTime[i] >= (unsigned long)VIBRATION_DURATION_MS) {
      vibrationLevel[i] = 0;  // auto-off after duration
    }
    analogWrite(vibrationPins[i], vibPWM[vibrationLevel[i]]);
  }
}

void stopAllVibration() {
  for (int i = 0; i < 4; i++) analogWrite(vibrationPins[i], 0);
  for (int i = 0; i < 4; i++) vibrationLevel[i] = 0;
}

// Seconds left on the running massage — the longest remaining of any active
// zone, 0 when nothing is buzzing. Both apps show this as a countdown, so the
// firmware is the single synced source (like the session clock). Ceils to the
// second so the display ticks 30..29..1..0 rather than showing 0 early.
int vibrationRemainingS() {
  unsigned long now = millis();
  unsigned long maxRemainMs = 0;
  for (int i = 0; i < 4; i++) {
    if (vibrationLevel[i] > 0) {
      unsigned long elapsed = now - vibStartTime[i];
      if (elapsed < (unsigned long)VIBRATION_DURATION_MS) {
        unsigned long remain = (unsigned long)VIBRATION_DURATION_MS - elapsed;
        if (remain > maxRemainMs) maxRemainMs = remain;
      }
    }
  }
  return (int)((maxRemainMs + 999) / 1000);
}
