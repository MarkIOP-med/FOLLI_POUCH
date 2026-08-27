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

// Seconds left on ONE zone's massage, 0 when that zone isn't buzzing. Ceils to
// the second so the display ticks 30..29..1..0 rather than showing 0 early.
// The operator app shows one of these per zone (independent countdowns).
int vibrationRemainingZoneS(int ch) {
  if (ch < 0 || ch > 3 || vibrationLevel[ch] <= 0) return 0;
  unsigned long elapsed = millis() - vibStartTime[ch];
  if (elapsed >= (unsigned long)VIBRATION_DURATION_MS) return 0;
  return (int)(((unsigned long)VIBRATION_DURATION_MS - elapsed + 999) / 1000);
}
